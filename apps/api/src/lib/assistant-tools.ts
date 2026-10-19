import {
  formatOrderReference,
  formatOrderStatus,
  isCustomerClaimableStatus,
  isStaffRole,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { catalogService } from "../services/catalog.service.js";
import { shippingService } from "../services/shipping.service.js";
import { createSupportTicket } from "./tickets.js";
import { searchQueryFrom, searchTokens } from "./voltie-intent.js";
import { HttpError } from "../http-error.js";
import { writeAudit } from "./audit.js";
import { emitOrderChange } from "./integration-events.js";

export type AssistantActor = {
  id?: string;
  email?: string;
  role?: string;
  displayName?: string | null;
};

export type AssistantUiBlock =
  | { type: "products"; items: { name: string; slug: string; href: string; price: number }[] }
  | { type: "confirm_claim"; orderId: string; reference: string; reason: string }
  | { type: "ticket"; reference: string; externalKey: string }
  | { type: "did_you_mean"; suggestion: string };

function shopInfo(topic: string) {
  if (topic === "shipping") {
    return "Standard is 3–5 business days and free over €150. Express is 1–2 days. Delivery windows are shown at checkout in Helsinki time.";
  }
  if (topic === "returns") {
    return "While an order is still Paid, open it and request a refund. After staff start processing or shipping, support handles refunds. For damage or a wrong item, open a claim — picking pauses until support reviews it.";
  }
  if (topic === "warranty") {
    return "Warranty months and notes are on each product page. Manufacturer and brand links are listed there when the supplier provided them.";
  }
  if (topic === "payments") {
    return "Checkout uses Stripe Payment Element. Card numbers never reach Volt servers. We store PaymentIntent ids only.";
  }
  if (topic === "promos") {
    return "A promotion applies only inside its start and end dates. The shop then shows the promo price, the regular price, and the lowest consumer price from the 30 days before the promo (EU price-indication rule).";
  }
  return "I can help with products, shipping, returns, orders you own, and opening a support ticket. I cannot see other customers’ data.";
}

const CATEGORY_ALIASES: Record<string, string> = {
  headphone: "audio",
  headphones: "audio",
  earbud: "audio",
  earbuds: "audio",
  earphone: "audio",
  earphones: "audio",
  headset: "audio",
  speaker: "audio",
  speakers: "audio",
  audio: "audio",
  laptop: "computers",
  laptops: "computers",
  computer: "computers",
  computers: "computers",
  notebook: "computers",
  monitor: "computers",
  monitors: "computers",
  display: "computers",
  phone: "phones",
  phones: "phones",
  smartphone: "phones",
  smartphones: "phones",
  watch: "wearables",
  watches: "wearables",
  wearable: "wearables",
  keyboard: "accessories",
  keyboards: "accessories",
  mouse: "accessories",
  mice: "accessories",
  charger: "accessories",
  accessories: "accessories",
  light: "smart-home",
  lights: "smart-home",
  hub: "smart-home",
};

function uniqueWords(values: string[]) {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const value of values) {
    const word = value.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

function catalogHits(
  items: { name: string; slug: string; sellingPrice?: number | string; price: number | string }[],
  label: string,
) {
  return {
    summary: `Here is what we have for ${label}.`,
    products: items.map((item) => ({
      name: item.name,
      slug: item.slug,
      href: `/products/${item.slug}`,
      price: Number(item.sellingPrice ?? item.price),
    })),
  };
}

async function resolveCategory(words: string[]) {
  for (const word of words) {
    const slug = CATEGORY_ALIASES[word.toLowerCase()];
    if (!slug) continue;
    const row = await prisma.category.findUnique({ where: { slug } });
    if (row) return row;
  }
  for (const word of words) {
    if (word.length < 4) continue;
    const row = await prisma.category.findFirst({
      where: {
        OR: [
          { name: { contains: word, mode: "insensitive" } },
          { description: { contains: word, mode: "insensitive" } },
        ],
      },
    });
    if (row) return row;
  }
  return null;
}

export async function toolSearchCatalog(query: string) {
  const cleaned = searchQueryFrom(query);
  const tokens = searchTokens(query);
  const attempts = uniqueWords([cleaned, ...tokens]);

  for (const attempt of attempts) {
    const result = await catalogService.list({ q: attempt, pageSize: 5, sort: "relevance" });
    if (result.items.length) return catalogHits(result.items, attempt);
  }

  const category = await resolveCategory(attempts);
  if (category) {
    const result = await catalogService.list({ category: category.slug, pageSize: 5 });
    if (result.items.length) return catalogHits(result.items, category.name.toLowerCase());
  }

  return {
    summary: `I could not find “${cleaned || query}” in the catalog.`,
    products: [],
  };
}

export async function toolShopInfo(topic: string) {
  const shipping = topic === "shipping" ? await shippingService.list(true) : [];
  return {
    text: shopInfo(topic),
    shipping: shipping.map((row) => ({
      code: row.code,
      name: row.name,
      price: row.price,
      days: `${row.minDays}–${row.maxDays}`,
    })),
  };
}

export type VisibleOrder = {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  claimable: boolean;
  total: number;
  summary: string;
};

export async function toolMyOrders(actor: AssistantActor, reference?: string | null) {
  if (!actor.id || isStaffRole(actor.role ?? "")) {
    return {
      needsSignIn: true,
      summary: "Sign in as the customer who placed the order. I will not look up orders by email alone.",
      orders: [] as VisibleOrder[],
    };
  }
  const rows = await prisma.order.findMany({
    where: { userId: actor.id },
    include: { items: { select: { productName: true, quantity: true } }, payment: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const orders = rows
    .map((order) => ({
      id: order.id,
      reference: formatOrderReference(order.id),
      status: order.status,
      statusLabel: formatOrderStatus(order.status),
      claimable: isCustomerClaimableStatus(order.status),
      total: Number(order.total),
      summary: order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", "),
    }))
    .filter((order) => !reference || order.reference === reference);
  return {
    needsSignIn: false,
    summary: orders.length
      ? `I can see ${orders.length} of your order(s).`
      : reference
        ? `No order ${reference} on this account.`
        : "No orders on this account yet.",
    orders,
  };
}

export async function toolCreateEnquiry(
  actor: AssistantActor,
  input: {
    subject: string;
    message: string;
    name?: string;
    email?: string;
    orderId?: string | null;
    orderReference?: string | null;
  },
) {
  const name = input.name || actor.displayName || "Customer";
  const email = input.email || actor.email;
  if (!email) {
    throw new HttpError(400, "Add an email so support can reply.");
  }
  const ticket = await createSupportTicket({
    kind: "ENQUIRY",
    subject: input.subject,
    message: input.message,
    customerName: name,
    customerEmail: email,
    userId: actor.id ?? null,
    orderId: input.orderId ?? null,
    orderReference: input.orderReference ?? null,
  });
  return ticket;
}

export async function toolConfirmClaim(actor: AssistantActor, orderId: string, reason: string) {
  if (!actor.id || isStaffRole(actor.role ?? "")) {
    throw new HttpError(401, "Sign in as the customer who owns this order.");
  }
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: actor.id },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (!isCustomerClaimableStatus(order.status)) {
    throw new HttpError(409, "This order cannot be moved to claims from chat.");
  }
  const reference = formatOrderReference(order.id);
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CLAIMS", hasDeviation: true },
    }),
    prisma.orderStatusEvent.create({
      data: { orderId: order.id, status: "CLAIMS", note: reason },
    }),
  ]);
  await writeAudit({
    actorId: actor.id,
    action: "order.claim",
    entity: "order",
    entityId: order.id,
    meta: {
      target: reference,
      changes: [{ field: "status", from: order.status, to: "CLAIMS" }],
    },
  });
  const ticket = await createSupportTicket({
    kind: "CLAIM",
    subject: `Claim ${reference}`,
    message: reason,
    customerName: actor.displayName || "Customer",
    customerEmail: actor.email || "unknown@invalid.local",
    userId: actor.id,
    orderId: order.id,
    orderReference: reference,
  });
  emitOrderChange("CLAIMS", { id: order.id, reference, status: "CLAIMS" });
  return { reference, ticket };
}
