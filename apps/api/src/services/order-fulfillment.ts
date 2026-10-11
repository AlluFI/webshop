import { Prisma } from "@prisma/client";
import type { PaymentStatusMessage } from "@volt/shared";
import { carrierName, carrierTrackingUrl, SHIPPING_CARRIER_META } from "@volt/shared";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { encryptJson, decrypt, decryptJson } from "../lib/crypto.js";
import { mail } from "../mail.js";
import type { OrderEmailShipping, OrderShippedEmailDetails } from "../lib/order-email.js";
import { shippingService } from "./shipping.service.js";

export type PaymentMeta = {
  guestAccessHash: string;
  cartId?: string;
  lastError?: string;
};

function moneyNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function storeOrigin() {
  return config.webAppUrl.replace(/\/$/, "");
}

function shippingForEmail(enc: string): OrderEmailShipping | null {
  try {
    const snap = decryptJson<{
      recipientName: string;
      line1: string;
      line2?: string;
      city: string;
      region?: string;
      postal: string;
      country?: string;
      countryName?: string;
    }>(enc);
    return {
      recipientName: snap.recipientName,
      line1: snap.line1,
      line2: snap.line2,
      city: snap.city,
      region: snap.region,
      postal: snap.postal,
      countryName: snap.countryName || snap.country || "",
    };
  } catch {
    return null;
  }
}

export async function releaseReservations(tx: Prisma.TransactionClient, orderId: string) {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, releasedAt: null },
  });
  for (const reservation of reservations) {
    await tx.product.update({
      where: { id: reservation.productId },
      data: { stockQuantity: { increment: reservation.quantity } },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: new Date() },
    });
  }
}

export async function restoreCartFromOrder(
  tx: Prisma.TransactionClient,
  order: { userId: string | null; items: { productId: string; quantity: number }[] },
  cartId: string | undefined,
) {
  let id = cartId;
  if (order.userId) {
    const existing = await tx.cart.findUnique({ where: { userId: order.userId } });
    id = existing?.id;
    if (!id) {
      const created = await tx.cart.create({ data: { userId: order.userId } });
      id = created.id;
    }
  }
  if (!id) return;
  for (const item of order.items) {
    const row = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId: id, productId: item.productId } },
    });
    if (row) {
      await tx.cartItem.update({
        where: { id: row.id },
        data: { quantity: Math.max(row.quantity, item.quantity) },
      });
    } else {
      await tx.cartItem.create({
        data: { cartId: id, productId: item.productId, quantity: item.quantity },
      });
    }
  }
}

export async function clearCartForOrder(
  tx: Prisma.TransactionClient,
  order: { userId: string | null },
  cartId: string | undefined,
) {
  let id = cartId;
  if (order.userId) {
    const existing = await tx.cart.findUnique({ where: { userId: order.userId } });
    id = existing?.id ?? id;
  }
  if (!id) return;
  await tx.cartItem.deleteMany({ where: { cartId: id } });
}

export async function handlePaymentStatus(message: PaymentStatusMessage) {
  const payment = await prisma.payment.findUnique({
    where: { orderId: message.orderId },
    include: {
      order: {
        include: {
          items: { include: { product: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!payment) return { ignored: true as const };

  if (message.outcome === "succeeded") {
    if (payment.status === "SUCCEEDED" || payment.order.status === "PAID") {
      return { ignored: true as const };
    }
    if (payment.order.status === "CANCELLED" || payment.order.status === "REFUNDED") {
      return { ignored: true as const };
    }
    const paidMeta: PaymentMeta = payment.metadataEnc
      ? decryptJson<PaymentMeta>(payment.metadataEnc)
      : { guestAccessHash: "" };
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
        },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: "PAID" },
      });
      await tx.orderStatusEvent.create({
        data: { orderId: payment.orderId, status: "PAID", note: "Stripe confirmed the payment." },
      });
      await clearCartForOrder(tx, payment.order, paidMeta.cartId);
    });
    const origin = storeOrigin();
    await mail.sendOrderPaid({
      orderId: payment.orderId,
      orderUrl: `${origin}/orders/${payment.orderId}`,
      status: "PAID",
      paymentStatus: "SUCCEEDED",
      placedAt: payment.order.createdAt,
      customerName: decrypt(payment.order.contactNameEnc),
      email: decrypt(payment.order.contactEmailEnc),
      phone: payment.order.contactPhoneEnc ? decrypt(payment.order.contactPhoneEnc) : "",
      items: payment.order.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: moneyNumber(item.unitPrice),
        lineTotal: moneyNumber(item.lineTotal),
        thumbnailUrl: item.thumbnailPath ? `${origin}/api/v1/files/${item.thumbnailPath}` : null,
        productUrl: `${origin}/products/${item.product.slug}`,
      })),
      subtotal: moneyNumber(payment.order.subtotal),
      shippingCost: moneyNumber(payment.order.shippingCost),
      shippingMethod: payment.order.shippingMethod,
      tax: moneyNumber(payment.order.tax),
      total: moneyNumber(payment.order.total),
      currency: payment.order.currency,
      shipping: shippingForEmail(payment.order.shippingAddressEnc),
    });
    return { status: "PAID" as const };
  }

  if (message.outcome === "processing") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PROCESSING",
        stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
      },
    });
    return { status: "PROCESSING" as const };
  }

  if (payment.status === "SUCCEEDED" || payment.order.status === "PAID") {
    return { ignored: true as const };
  }
  if (payment.order.status === "CANCELLED" || payment.order.status === "REFUNDED") {
    return { ignored: true as const };
  }
  if (payment.status === "FAILED" && payment.order.status === "PAYMENT_FAILED") {
    return { ignored: true as const };
  }

  const reason = message.reason || "The card was declined.";
  const meta: PaymentMeta = payment.metadataEnc
    ? decryptJson<PaymentMeta>(payment.metadataEnc)
    : { guestAccessHash: "" };

  await prisma.$transaction(async (tx) => {
    await releaseReservations(tx, message.orderId);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
        metadataEnc: encryptJson({ ...meta, lastError: reason }),
      },
    });
    await tx.order.update({
      where: { id: message.orderId },
      data: { status: "PAYMENT_FAILED" },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: message.orderId, status: "PAYMENT_FAILED", note: reason },
    });
    await restoreCartFromOrder(tx, payment.order, meta.cartId);
  });

  const origin = storeOrigin();
  await mail.sendPaymentFailed({
    orderId: payment.orderId,
    orderUrl: `${origin}/orders/${payment.orderId}`,
    cartUrl: `${origin}/cart`,
    status: "PAYMENT_FAILED",
    paymentStatus: "FAILED",
    placedAt: payment.order.createdAt,
    customerName: decrypt(payment.order.contactNameEnc),
    email: decrypt(payment.order.contactEmailEnc),
    phone: payment.order.contactPhoneEnc ? decrypt(payment.order.contactPhoneEnc) : "",
    items: payment.order.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: moneyNumber(item.unitPrice),
      lineTotal: moneyNumber(item.lineTotal),
      thumbnailUrl: item.thumbnailPath ? `${origin}/api/v1/files/${item.thumbnailPath}` : null,
      productUrl: `${origin}/products/${item.product.slug}`,
    })),
    subtotal: moneyNumber(payment.order.subtotal),
    shippingCost: moneyNumber(payment.order.shippingCost),
    shippingMethod: payment.order.shippingMethod,
    tax: moneyNumber(payment.order.tax),
    total: moneyNumber(payment.order.total),
    currency: payment.order.currency,
    shipping: shippingForEmail(payment.order.shippingAddressEnc),
    failureReason: reason,
  });
  return { status: "PAYMENT_FAILED" as const };
}

export async function sendOrderShippedMail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { slug: true } } } },
    },
  });
  if (!order?.trackingCarrier || !order.trackingCode) return;
  const carrier = order.trackingCarrier;
  const trackingCode = order.trackingCode;

  const origin = storeOrigin();
  const options = await shippingService.list(true);
  const option = options.find((row) => row.code === order.shippingMethod);
  const eta =
    order.estimatedDeliveryFrom && order.estimatedDeliveryTo
      ? shippingService.window(order.estimatedDeliveryFrom, order.estimatedDeliveryTo)
      : option
        ? shippingService.estimate(option, order.shippedAt ?? new Date())
        : { from: "", to: "", label: "Soon" };

  const details: OrderShippedEmailDetails = {
    orderId: order.id,
    orderUrl: `${origin}/orders/${order.id}`,
    status: "WITH_COURIER",
    paymentStatus: "SUCCEEDED",
    placedAt: order.createdAt,
    customerName: decrypt(order.contactNameEnc),
    email: decrypt(order.contactEmailEnc),
    phone: order.contactPhoneEnc ? decrypt(order.contactPhoneEnc) : "",
    items: order.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: moneyNumber(item.unitPrice),
      lineTotal: moneyNumber(item.lineTotal),
      thumbnailUrl: item.thumbnailPath ? `${origin}/api/v1/files/${item.thumbnailPath}` : null,
      productUrl: `${origin}/products/${item.product.slug}`,
    })),
    subtotal: moneyNumber(order.subtotal),
    shippingCost: moneyNumber(order.shippingCost),
    shippingMethod: order.shippingMethod,
    tax: moneyNumber(order.tax),
    total: moneyNumber(order.total),
    currency: order.currency,
    shipping: shippingForEmail(order.shippingAddressEnc),
    carrier,
    carrierName: carrierName(carrier),
    trackingCode,
    trackingUrl: carrierTrackingUrl(carrier, trackingCode),
    carrierPages: Object.values(SHIPPING_CARRIER_META).map((meta) => ({
      name: meta.name,
      url:
        meta.name === carrierName(carrier) ? carrierTrackingUrl(carrier, trackingCode) : meta.searchUrl,
    })),
    estimatedDeliveryLabel: eta.label,
    estimatedDeliveryFrom: eta.from,
    estimatedDeliveryTo: eta.to,
  };

  await mail.sendOrderShipped(details);
}
