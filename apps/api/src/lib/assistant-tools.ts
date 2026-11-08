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
import { CATEGORY_ALIASES, partitionCatalogHits } from "./catalog-match.js";
import { HttpError } from "../http-error.js";
import { writeAudit } from "./audit.js";
import { emitOrderChange } from "./integration-events.js";

export type AssistantActor = {
  id?: string;
  email?: string;
  role?: string;
  displayName?: string | null;
};

export type CatalogCard = { name: string; slug: string; href: string; price: number };

export type CatalogSearchResult = {
  summary: string;
  products: CatalogCard[];
  related: CatalogCard[];
};

export type AssistantUiBlock =
  | { type: "products"; title?: string; items: CatalogCard[] }
  | { type: "confirm_claim"; orderId: string; reference: string; reason: string; productName?: string }
  | { type: "ticket"; reference: string; externalKey: string }
  | { type: "link"; href: string; label: string }
  | { type: "did_you_mean"; suggestion: string }
  | {
      type: "order_picker";
      problem: string;
      items: { n: number; orderId: string; reference: string; statusLabel: string; summary: string }[];
    }
  | {
      type: "product_picker";
      problem: string;
      orderId: string;
      reference: string;
      items: { n: number; productId: string; name: string; quantity: number }[];
    }
  | {
      type: "confirm_status";
      orderId: string;
      reference: string;
      status: string;
      note?: string;
    }
  | {
      type: "confirm_refund";
      orderId: string;
      reference: string;
      reason: string;
      note?: string;
    };

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
  return "I can help with products, shipping, returns, tracking an order on Find order, and opening a support ticket. I cannot see other customers’ data.";
}

export function guestOrderLookupBlock(): AssistantUiBlock {
  return { type: "link", href: "/orders/lookup", label: "Open Find order" };
}

export function guestOrderGuidance(options?: { reference?: string | null; problem?: boolean }) {
  const reference = options?.reference?.trim() || null;
  const track = reference
    ? `I can’t open ${reference} in chat. You don’t need an account — open Find order, enter that VC- number and the last name on the order. The confirmation email also has a View your order link. I never look up orders by email.`
    : "You don’t need an account to track an order. Open Find order in the footer, then enter the VC- number from your confirmation email and the last name on the order. That email also has a View your order link. I never look up orders by email in chat.";
  const content = options?.problem
    ? `${track} If something arrived wrong, give me an email and I’ll send a note to support.`
    : track;
  return { content, uiBlocks: [guestOrderLookupBlock()] };
}

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

function toCard(item: {
  name: string;
  slug: string;
  sellingPrice?: number | string;
  price: number | string;
}): CatalogCard {
  return {
    name: item.name,
    slug: item.slug,
    href: `/products/${item.slug}`,
    price: Number(item.sellingPrice ?? item.price),
  };
}

export function catalogProductBlocks(found: CatalogSearchResult): AssistantUiBlock[] {
  const blocks: AssistantUiBlock[] = [];
  if (found.products.length) {
    blocks.push({
      type: "products",
      title: found.related.length ? "Matches" : undefined,
      items: found.products,
    });
  }
  if (found.related.length) {
    blocks.push({ type: "products", title: "Related accessories", items: found.related });
  }
  return blocks;
}

function catalogSummary(label: string, matches: CatalogCard[], related: CatalogCard[]): CatalogSearchResult {
  if (!matches.length && !related.length) {
    return { summary: `I could not find “${label}” in the catalog.`, products: [], related: [] };
  }
  if (matches.length && related.length) {
    return {
      summary: `Matches for ${label}, plus related accessories.`,
      products: matches,
      related,
    };
  }
  if (matches.length) {
    return { summary: `Here is what we have for ${label}.`, products: matches, related: [] };
  }
  return {
    summary: `I did not find ${label} in the catalog. Related accessories:`,
    products: [],
    related,
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

export async function toolSearchCatalog(query: string): Promise<CatalogSearchResult> {
  const cleaned = searchQueryFrom(query);
  const tokens = searchTokens(query);
  const attempts = uniqueWords([cleaned, ...tokens]);
  const label = cleaned || attempts[0] || query;
  const category = await resolveCategory(attempts);
  const byId = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      sellingPrice?: number | string;
      price: number | string;
      category: { slug: string };
      brand: { name: string };
    }
  >();

  function add(
    items: {
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      sellingPrice?: number | string;
      price: number | string;
      category: { slug: string };
      brand: { name: string };
    }[],
  ) {
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  for (const attempt of attempts) {
    add((await catalogService.list({ q: attempt, pageSize: 8, sort: "relevance" })).items);
  }
  if (category) {
    add((await catalogService.list({ category: category.slug, pageSize: 8 })).items);
    add((await catalogService.list({ category: "accessories", q: attemptToken(attempts), pageSize: 4 })).items);
  }

  const pooled = [...byId.values()];
  const { matches, related } = partitionCatalogHits(pooled, tokens.length ? tokens : attempts, category?.slug ?? null);
  const relatedFirst = [
    ...related.filter((item) => item.category.slug === "accessories"),
    ...related.filter((item) => item.category.slug !== "accessories"),
  ].slice(0, 3);

  return catalogSummary(label, matches.slice(0, 5).map(toCard), relatedFirst.map(toCard));
}

function attemptToken(attempts: string[]) {
  return attempts.find((word) => word.length >= 3) ?? attempts[0] ?? "";
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

export type VisibleOrderItem = {
  productId: string;
  name: string;
  quantity: number;
};

export type VisibleOrder = {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  claimable: boolean;
  total: number;
  summary: string;
  items: VisibleOrderItem[];
};

export function uniqueOrderProducts(items: VisibleOrderItem[]) {
  const seen = new Map<string, VisibleOrderItem>();
  for (const item of items) {
    const current = seen.get(item.productId);
    if (current) current.quantity += item.quantity;
    else seen.set(item.productId, { ...item });
  }
  return [...seen.values()];
}

export async function toolMyOrders(actor: AssistantActor, reference?: string | null) {
  if (!actor.id || isStaffRole(actor.role ?? "")) {
    return {
      needsSignIn: true,
      summary: guestOrderGuidance({ reference }).content,
      orders: [] as VisibleOrder[],
    };
  }
  const rows = await prisma.order.findMany({
    where: { userId: actor.id },
    include: { items: { select: { productId: true, productName: true, quantity: true } }, payment: { select: { status: true } } },
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
      items: uniqueOrderProducts(
        order.items.map((item) => ({
          productId: item.productId,
          name: item.productName,
          quantity: item.quantity,
        })),
      ),
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

export async function toolConfirmClaim(actor: AssistantActor, orderId: string, reason: string, productName?: string | null) {
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
  const product = productName?.trim() || null;
  const ticket = await createSupportTicket({
    kind: "CLAIM",
    subject: product ? `Claim ${reference} — ${product}` : `Claim ${reference}`,
    message: product && !reason.toLowerCase().includes(product.toLowerCase()) ? `${reason}\nProduct: ${product}` : reason,
    customerName: actor.displayName || "Customer",
    customerEmail: actor.email || "unknown@invalid.local",
    userId: actor.id,
    orderId: order.id,
    orderReference: reference,
    productName: product,
  });
  emitOrderChange("CLAIMS", { id: order.id, reference, status: "CLAIMS" });
  return { reference, ticket };
}
