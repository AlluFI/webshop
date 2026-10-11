import Stripe from "stripe";
import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";
import {
  carrierName,
  carrierTrackingUrl,
  CHECKOUT_COUNTRIES,
  checkoutPlaceSchema,
  customerRefundRequestSchema,
  formatLocatorCode,
  formatOrderReference,
  formatRefundNote,
  orderListQuerySchema,
  staffRefundRequestSchema,
  STAFF_REFUNDABLE_STATUSES,
  storeDayEnd,
  storeDayStart,
  stripeRefundReason,
  vatFromInclusive,
  vatIncludedLabel,
  type AddressInput,
  type PaymentStatusMessage,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { encrypt, encryptJson, decrypt, decryptJson } from "../lib/crypto.js";
import { randomToken, sha256Hex } from "../lib/hash.js";
import { orderTotal, taxAmount, toCents } from "../lib/cart-math.js";
import { requireStripe, stripeConfigured, stripePublishableKey } from "../lib/stripe.js";
import { publishPaymentStatus } from "../lib/queue.js";
import { cartService, type CartContext } from "./cart.service.js";
import { addressService } from "./address.service.js";
import { shippingService } from "./shipping.service.js";
import {
  handlePaymentStatus,
  releaseReservations,
  restoreCartFromOrder,
  type PaymentMeta,
} from "./order-fulfillment.js";

type ShippingSnapshot = AddressInput & { countryName: string };

function toAddressInput(row: {
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postal: string;
  country: string;
  phone?: string | null;
  label?: string | null;
  isDefault?: boolean;
}): AddressInput {
  return {
    recipientName: row.recipientName,
    line1: row.line1,
    line2: row.line2 || "",
    city: row.city,
    region: row.region || "",
    postal: row.postal,
    country: row.country as AddressInput["country"],
    phone: row.phone || "",
    label: row.label || "",
    isDefault: row.isDefault,
  };
}

function countryName(code: string) {
  return CHECKOUT_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

function moneyNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

const orderInclude = {
  items: { include: { product: { select: { slug: true } } }, orderBy: { productName: "asc" as const } },
  payment: true,
  events: { orderBy: { createdAt: "asc" as const } },
} as const;

async function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: orderInclude,
  });
}

function readMeta(metadataEnc: string | null): PaymentMeta {
  if (!metadataEnc) return { guestAccessHash: "" };
  return decryptJson<PaymentMeta>(metadataEnc);
}

function shippingOf(enc: string): ShippingSnapshot | null {
  try {
    return decryptJson<ShippingSnapshot>(enc);
  } catch {
    return null;
  }
}

async function findPaidReplacement(
  order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>,
) {
  if (order.status !== "PAYMENT_FAILED" || !order.userId) return null;
  const needed = [...new Set(order.items.map((item) => item.productId))];
  if (needed.length === 0) return null;
  const candidates = await prisma.order.findMany({
    where: {
      id: { not: order.id },
      userId: order.userId,
      status: "PAID",
      createdAt: { gt: order.createdAt },
      items: { some: { productId: { in: needed } } },
    },
    select: { id: true, items: { select: { productId: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return (
    candidates.find((candidate) =>
      needed.every((productId) => candidate.items.some((item) => item.productId === productId)),
    )?.id ?? null
  );
}

async function publicOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>) {
  const status = order.status as OrderStatus;
  const replacedByOrderId = await findPaidReplacement(order);
  const shippingOptions = await shippingService.list(true);
  const option = shippingOptions.find((row) => row.code === order.shippingMethod);
  const estimatedDelivery =
    order.estimatedDeliveryFrom && order.estimatedDeliveryTo
      ? shippingService.window(order.estimatedDeliveryFrom, order.estimatedDeliveryTo)
      : option
        ? shippingService.estimate(option, order.shippedAt ?? order.createdAt)
        : null;
  const tracking =
    order.trackingCarrier && order.trackingCode
      ? {
          carrier: order.trackingCarrier,
          carrierName: carrierName(order.trackingCarrier),
          code: order.trackingCode,
          url: carrierTrackingUrl(order.trackingCarrier, order.trackingCode),
        }
      : null;
  const subtotal = moneyNumber(order.subtotal);
  const shippingCost = moneyNumber(order.shippingCost);
  const storedTax = moneyNumber(order.tax);
  return {
    id: order.id,
    reference: formatOrderReference(order.id),
    status,
    paymentStatus: (order.payment?.status ?? "REQUIRES_PAYMENT") as PaymentStatus,
    currency: order.currency,
    subtotal,
    shippingCost,
    tax: storedTax > 0 ? storedTax : vatFromInclusive(subtotal + shippingCost),
    taxLabel: vatIncludedLabel(),
    total: moneyNumber(order.total),
    shippingMethod: order.shippingMethod,
    estimatedDelivery,
    tracking,
    email: decrypt(order.contactEmailEnc),
    displayName: decrypt(order.contactNameEnc),
    phone: order.contactPhoneEnc ? decrypt(order.contactPhoneEnc) : "",
    shipping: shippingOf(order.shippingAddressEnc),
    createdAt: order.createdAt.toISOString(),
    canCancel: status === "PENDING_PAYMENT",
    canRefund: status === "PAID",
    canRetry: status === "PAYMENT_FAILED" && !replacedByOrderId,
    replacedByOrderId,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      slug: item.product.slug,
      quantity: item.quantity,
      unitPrice: moneyNumber(item.unitPrice),
      lineTotal: moneyNumber(item.lineTotal),
      thumbnail: item.thumbnailPath ? `/api/v1/files/${item.thumbnailPath}` : null,
      locatorCode: item.locatorCode || null,
    })),
    events: order.events.map((event) => ({
      id: event.id,
      status: event.status,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function canRead(
  order: { userId: string | null; payment: { metadataEnc: string | null } | null },
  ctx: CartContext,
  orderToken?: string,
) {
  if (ctx.userId && order.userId === ctx.userId) return true;
  if (!orderToken || !order.payment?.metadataEnc) return false;
  try {
    return readMeta(order.payment.metadataEnc).guestAccessHash === sha256Hex(orderToken);
  } catch {
    return false;
  }
}

function parseDay(value: string | undefined, end: boolean) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return end ? storeDayEnd(value) : storeDayStart(value);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "Invalid date filter", { [end ? "to" : "from"]: "Use YYYY-MM-DD" });
  }
  return parsed;
}

function intentToMessage(intent: {
  id: string;
  status: string;
  metadata?: Stripe.Metadata | null;
  last_payment_error?: { message?: string | null } | null;
  orderId?: string;
}): PaymentStatusMessage | null {
  const orderId = intent.orderId || intent.metadata?.orderId;
  if (!orderId) return null;
  if (intent.status === "succeeded") {
    return { v: 1, orderId, paymentIntentId: intent.id, outcome: "succeeded" };
  }
  if (intent.status === "processing") {
    return { v: 1, orderId, paymentIntentId: intent.id, outcome: "processing" };
  }
  if (intent.status === "requires_action") return null;
  if (intent.status === "canceled") {
    return {
      v: 1,
      orderId,
      paymentIntentId: intent.id,
      outcome: "canceled",
      reason: intent.last_payment_error?.message || "Payment was cancelled.",
    };
  }
  // Initial PI status is also requires_payment_method — only fail after Stripe records an error.
  if (intent.status === "requires_payment_method" && intent.last_payment_error) {
    return {
      v: 1,
      orderId,
      paymentIntentId: intent.id,
      outcome: "failed",
      reason: intent.last_payment_error.message || "The card was declined.",
    };
  }
  return null;
}

async function findPendingCheckout(ctx: CartContext, cartId: string | null) {
  if (ctx.userId) {
    return prisma.order.findFirst({
      where: { userId: ctx.userId, status: "PENDING_PAYMENT" },
      include: { payment: true, items: true },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!cartId) return null;
  const candidates = await prisma.order.findMany({
    where: { userId: null, status: "PENDING_PAYMENT" },
    include: { payment: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  for (const order of candidates) {
    try {
      if (readMeta(order.payment?.metadataEnc ?? null).cartId === cartId) return order;
    } catch {
      continue;
    }
  }
  return null;
}

async function closePendingCheckout(
  order: {
    id: string;
    userId: string | null;
    items: { productId: string; quantity: number }[];
    payment: { stripePaymentIntentId: string | null; metadataEnc: string | null } | null;
  },
  note: string,
) {
  if (order.payment?.stripePaymentIntentId && stripeConfigured()) {
    await requireStripe()
      .paymentIntents.cancel(order.payment.stripePaymentIntentId)
      .catch(() => undefined);
  }
  const meta = readMeta(order.payment?.metadataEnc ?? null);
  await prisma.$transaction(async (tx) => {
    await releaseReservations(tx, order.id);
    await tx.payment.update({
      where: { orderId: order.id },
      data: { status: "CANCELLED" },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, status: "CANCELLED", note },
    });
    await restoreCartFromOrder(tx, order, meta.cartId);
  });
}

export const orderService = {
  config() {
    return {
      configured: stripeConfigured(),
      publishableKey: stripeConfigured() ? stripePublishableKey() : "",
      currency: "eur",
    };
  },

  async place(ctx: CartContext, input: unknown, options: { simulateTimeout?: boolean } = {}) {
    const dto = checkoutPlaceSchema.parse(input);
    requireStripe();
    if (options.simulateTimeout) {
      throw new HttpError(504, "The payment provider timed out. Please try again.", {
        payment: "Gateway timeout. Nothing was charged.",
      });
    }

    const cart = await cartService.get(ctx, { skipStockSync: true });
    if (cart.dto.items.length === 0) {
      throw new HttpError(400, "Your cart is empty.", { cart: "Add an item before checkout." });
    }
    const alreadyOpen = await findPendingCheckout(ctx, cart.dto.id);
    if (alreadyOpen) {
      await closePendingCheckout(alreadyOpen, "Replaced by a new checkout attempt.");
    }

    let address: AddressInput | undefined = dto.address;
    if (dto.addressId) {
      if (!ctx.userId) throw new HttpError(401, "Sign in to use a saved address");
      address = toAddressInput(await addressService.get(ctx.userId, dto.addressId));
    }
    if (!address) {
      throw new HttpError(400, "Shipping address is required", {
        address: "Shipping address is required",
      });
    }
    const shippingAddress: AddressInput = address;
    if (ctx.userId && dto.saveAddress && dto.address) {
      const saved = await addressService.create(ctx.userId, {
        ...dto.address,
        phone: dto.address.phone || dto.phone,
        isDefault: true,
      });
      Object.assign(shippingAddress, toAddressInput(saved));
    }

    const quoted = await shippingService.quote(dto.shippingMethod, cart.dto.subtotal);
    const shipping = quoted.cost;
    const tax = taxAmount(cart.dto.subtotal, shipping);
    const total = orderTotal(cart.dto.subtotal, shipping, tax);
    const guestAccess = randomToken();
    const snapshot: ShippingSnapshot = {
      ...shippingAddress,
      countryName: countryName(shippingAddress.country),
    };
    const cartId = cart.dto.id ?? undefined;

    // Lock products in id order so two concurrent checkouts cannot deadlock or oversell.
    const created = await prisma.$transaction(async (tx) => {
      const ids = [...new Set(cart.dto.items.map((item) => item.productId))].sort();
      for (const id of ids) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      }
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
      });
      const byId = new Map(products.map((product) => [product.id, product]));

      for (const item of cart.dto.items) {
        const product = byId.get(item.productId);
        if (!product || product.stockQuantity < item.quantity) {
          const name = product?.name ?? item.name;
          const left = product?.stockQuantity ?? 0;
          throw new HttpError(409, `Only ${left} of ${name} left in stock.`, {
            quantity: `Only ${left} of ${name} available.`,
          });
        }
      }

      const order = await tx.order.create({
        data: {
          userId: ctx.userId ?? null,
          status: "PENDING_PAYMENT",
          currency: "EUR",
          subtotal: new Prisma.Decimal(cart.dto.subtotal),
          shippingCost: new Prisma.Decimal(shipping),
          tax: new Prisma.Decimal(tax),
          total: new Prisma.Decimal(total),
          shippingMethod: dto.shippingMethod,
          contactEmailEnc: encrypt(dto.email),
          contactNameEnc: encrypt(dto.displayName),
          contactPhoneEnc: encrypt(dto.phone),
          shippingAddressEnc: encryptJson(snapshot),
          billingAddressEnc: encryptJson(
            dto.billingSameAsShipping === false && dto.billingAddress
              ? { ...dto.billingAddress, countryName: countryName(dto.billingAddress.country) }
              : snapshot,
          ),
          shippingAddressId: dto.addressId ?? null,
          items: {
            create: cart.dto.items.map((item) => {
              const product = byId.get(item.productId)!;
              return {
                productId: item.productId,
                productName: product.name,
                quantity: item.quantity,
                unitPrice: product.price,
                lineTotal: new Prisma.Decimal(item.lineTotal),
                thumbnailPath: product.images[0]?.thumbPath || product.images[0]?.path || null,
                locatorCode: formatLocatorCode(
                  product.locatorStation,
                  product.locatorBlock,
                  product.locatorShelf,
                  product.locatorPlace,
                ),
                barcode: product.barcode,
              };
            }),
          },
          events: {
            create: { status: "PENDING_PAYMENT", note: "Order placed. Waiting for payment." },
          },
          payment: {
            create: {
              status: "REQUIRES_PAYMENT",
              amount: new Prisma.Decimal(total),
              currency: "EUR",
              metadataEnc: encryptJson({
                guestAccessHash: sha256Hex(guestAccess),
                cartId,
              } satisfies PaymentMeta),
            },
          },
          reservations: {
            create: cart.dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      });

      for (const item of cart.dto.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }

      return order;
    });

    // Stock is already reserved. If Stripe cannot create the intent, fail the order
    // through the same worker path so inventory and the cart come back.
    try {
      const intent = await requireStripe().paymentIntents.create({
        amount: toCents(total),
        currency: "eur",
        metadata: { orderId: created.id },
        automatic_payment_methods: { enabled: true },
      });
      if (!intent.client_secret) {
        throw new Error("Stripe did not return a client secret");
      }
      await prisma.payment.update({
        where: { orderId: created.id },
        data: { stripePaymentIntentId: intent.id },
      });
      const loaded = await loadOrder(created.id);
      if (!loaded) throw new HttpError(500, "Order could not be reloaded");
      return {
        cookie: cart.cookie,
        clientSecret: intent.client_secret,
        publishableKey: stripePublishableKey(),
        orderAccessToken: guestAccess,
        order: await publicOrder(loaded),
      };
    } catch (error) {
      await handlePaymentStatus({
        v: 1,
        orderId: created.id,
        outcome: "failed",
        reason: "The payment provider could not start the charge.",
      });
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "The payment provider could not start the charge.", {
        payment: "Please try again in a moment.",
      });
    }
  },

  async get(ctx: CartContext, orderId: string, orderToken?: string) {
    const order = await loadOrder(orderId);
    if (!order || !canRead(order, ctx, orderToken)) {
      throw new HttpError(404, "Order not found");
    }
    return await publicOrder(order);
  },

  async list(userId: string, rawQuery: unknown) {
    const query = orderListQuerySchema.parse(rawQuery);
    const from = parseDay(query.from, false);
    const to = parseDay(query.to, true);
    const where: Prisma.OrderWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          payment: { select: { status: true } },
          items: { select: { quantity: true, productName: true, thumbnailPath: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((order) => ({
        id: order.id,
        reference: formatOrderReference(order.id),
        status: order.status,
        paymentStatus: order.payment?.status ?? "REQUIRES_PAYMENT",
        total: moneyNumber(order.total),
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        summary: order.items.map((item) => item.productName).join(", "),
        thumbnail: order.items[0]?.thumbnailPath
          ? `/api/v1/files/${order.items[0].thumbnailPath}`
          : null,
      })),
    };
  },

  async sync(ctx: CartContext, orderId: string, orderToken?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || !canRead(order, ctx, orderToken)) {
      throw new HttpError(404, "Order not found");
    }
    const intentId = order.payment?.stripePaymentIntentId;
    if (!intentId) throw new HttpError(409, "This order is still waiting for a payment intent.");
    const intent = await requireStripe().paymentIntents.retrieve(intentId);
    await this.applyPaymentIntent({ ...intent, metadata: { ...intent.metadata, orderId } });
    const loaded = await loadOrder(orderId);
    if (!loaded) throw new HttpError(404, "Order not found");
    return await publicOrder(loaded);
  },

  async applyStripeEvent(rawBody: Buffer, signature: string | undefined) {
    if (!config.stripeWebhookSecret) {
      throw new HttpError(503, "Stripe webhook secret is not configured");
    }
    if (!signature) throw new HttpError(400, "Missing Stripe-Signature header");
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    } catch {
      throw new HttpError(400, "Invalid Stripe signature");
    }
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      await this.applyPaymentIntent(event.data.object);
    }
    return { received: true, type: event.type };
  },

  async applyPaymentIntent(intent: {
    id: string;
    status: string;
    metadata?: Stripe.Metadata | null;
    last_payment_error?: { message?: string | null } | null;
  }) {
    let orderId = intent.metadata?.orderId;
    if (!orderId) {
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      orderId = payment?.orderId;
    }
    const message = intentToMessage({ ...intent, orderId });
    if (!message) return { ignored: true as const };
    await publishPaymentStatus(message);
    return { queued: message.outcome };
  },

  async abandonOpenCheckout(ctx: CartContext) {
    const cart = await cartService.get(ctx, { skipStockSync: true });
    const pending = await findPendingCheckout(ctx, cart.dto.id);
    if (!pending) {
      return { abandoned: false as const, cookie: cart.cookie, cart: cart.dto };
    }
    await closePendingCheckout(pending, "Left checkout before payment. Cart kept.");
    const next = await cartService.get(ctx);
    return { abandoned: true as const, cookie: next.cookie, cart: next.dto };
  },

  async cancel(ctx: CartContext, orderId: string, orderToken?: string, asStaff = false) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, items: true },
    });
    if (!order || (!asStaff && !canRead(order, ctx, orderToken))) {
      throw new HttpError(404, "Order not found");
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new HttpError(409, "Only unprocessed orders can be cancelled.");
    }
    await closePendingCheckout(order, "Cancelled before payment completed.");
    const loaded = await loadOrder(orderId);
    if (!loaded) throw new HttpError(404, "Order not found");
    return await publicOrder(loaded);
  },

  async refund(
    ctx: CartContext,
    orderId: string,
    orderToken?: string,
    asStaff = false,
    input: unknown = {},
  ) {
    const dto = (asStaff ? staffRefundRequestSchema : customerRefundRequestSchema).parse(input);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, items: true },
    });
    if (!order || (!asStaff && !canRead(order, ctx, orderToken))) {
      throw new HttpError(404, "Order not found");
    }
    const refundable = asStaff
      ? (STAFF_REFUNDABLE_STATUSES as readonly string[]).includes(order.status)
      : order.status === "PAID";
    if (!refundable) {
      throw new HttpError(
        409,
        asStaff
          ? "Only paid through delivered orders can be refunded."
          : "This order can no longer be refunded from your account. Contact support.",
      );
    }
    const intentId = order.payment?.stripePaymentIntentId;
    if (!intentId) throw new HttpError(409, "This order has no payment to refund.");
    const note = formatRefundNote(dto.reason, dto.note, asStaff ? "staff" : "customer");
    try {
      await requireStripe().refunds.create({
        payment_intent: intentId,
        reason: stripeRefundReason(dto.reason),
        metadata: {
          shop_reason: dto.reason,
          shop_note: dto.note?.trim() || "",
          actor: asStaff ? "staff" : "customer",
        },
      });
    } catch {
      throw new HttpError(502, "Stripe could not refund this payment.", {
        payment: "Try again in a moment, or refund from the Stripe Dashboard.",
      });
    }
    await prisma.$transaction(async (tx) => {
      await releaseReservations(tx, orderId);
      await tx.payment.update({
        where: { orderId },
        data: { status: "REFUNDED" },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: "REFUNDED" },
      });
      await tx.orderStatusEvent.create({
        data: { orderId, status: "REFUNDED", note },
      });
    });
    const loaded = await loadOrder(orderId);
    if (!loaded) throw new HttpError(404, "Order not found");
    return await publicOrder(loaded);
  },

  async adminGet(orderId: string) {
    const loaded = await loadOrder(orderId);
    if (!loaded) throw new HttpError(404, "Order not found");
    return await publicOrder(loaded);
  },

  async adminRefund(orderId: string, input: unknown = {}) {
    return this.refund({ userId: undefined }, orderId, undefined, true, input);
  },
};
