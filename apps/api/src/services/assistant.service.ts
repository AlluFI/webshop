import { Prisma } from "@prisma/client";
import {
  assistantClaimSchema,
  assistantEnquirySchema,
  assistantMessageSchema,
  assistantStaffActionSchema,
  isStaffRole,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import {
  toolConfirmClaim,
  toolCreateEnquiry,
  toolMyOrders,
  catalogProductBlocks,
  toolSearchCatalog,
  toolShopInfo,
  uniqueOrderProducts,
  type AssistantActor,
  type AssistantUiBlock,
  type VisibleOrder,
  type VisibleOrderItem,
} from "../lib/assistant-tools.js";
import {
  applyThreadContext,
  extractEmail,
  extractOrderChoice,
  lastOrderFromTranscript,
  looksLikeProblem,
  looksLikeWholeOrder,
  matchOrderProduct,
  resolveVoltieUtterance,
  wantsLatestOrder,
  wantsOrderHelp,
} from "../lib/voltie-intent.js";
import { staffConfirmAction, staffRuleReply } from "../lib/staff-assistant.service.js";

function asBlocks(value: Prisma.JsonValue | null): AssistantUiBlock[] {
  return Array.isArray(value) ? (value as AssistantUiBlock[]) : [];
}

async function loadActor(userId?: string): Promise<AssistantActor> {
  if (!userId) return {};
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || user.deletedAt) return {};
  return {
    id: user.id,
    email: user.email,
    role: user.role.name,
    displayName: user.displayName,
  };
}

async function assertThread(threadId: string, userId?: string) {
  const thread = await prisma.assistantThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new HttpError(404, "Chat not found");
  if (thread.userId && thread.userId !== userId) {
    throw new HttpError(404, "Chat not found");
  }
  if (userId && !thread.userId) {
    return prisma.assistantThread.update({ where: { id: threadId }, data: { userId } });
  }
  return thread;
}

type OrderPicker = Extract<AssistantUiBlock, { type: "order_picker" }>;
type ProductPicker = Extract<AssistantUiBlock, { type: "product_picker" }>;
type HelpPicker = OrderPicker | ProductPicker;

function lastHelpPicker(blocks: AssistantUiBlock[]): HelpPicker | null {
  return (
    blocks.find((block): block is ProductPicker => block.type === "product_picker") ??
    blocks.find((block): block is OrderPicker => block.type === "order_picker") ??
    null
  );
}

function pickerBlock(problem: string, orders: VisibleOrder[]): OrderPicker {
  return {
    type: "order_picker",
    problem,
    items: orders.slice(0, 8).map((order, index) => ({
      n: index + 1,
      orderId: order.id,
      reference: order.reference,
      statusLabel: order.statusLabel,
      summary: order.summary,
    })),
  };
}

function productPickerBlock(problem: string, order: VisibleOrder, products: VisibleOrderItem[]): ProductPicker {
  const items = products.slice(0, 8).map((item, index) => ({
    n: index + 1,
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
  }));
  items.push({
    n: items.length + 1,
    productId: "",
    name: "The whole order",
    quantity: 0,
  });
  return { type: "product_picker", problem, orderId: order.id, reference: order.reference, items };
}

function claimReason(problem: string, productLabel: string, reference: string) {
  const text = problem.replace(/\s+/g, " ").trim();
  return `${text} — ${productLabel} on ${reference}`;
}

function resolveProductLabel(problem: string, products: VisibleOrderItem[], selected?: string | null) {
  if (selected) return selected;
  if (looksLikeWholeOrder(problem)) return "the whole order";
  if (products.length === 1) return products[0].name;
  return matchOrderProduct(problem, products.map((item, index) => ({ n: index + 1, ...item })))?.name ?? null;
}

async function continueOrderHelp(
  actor: AssistantActor,
  reference: string,
  problem: string,
  selectedProduct?: string | null,
) {
  const orders = await toolMyOrders(actor, reference);
  if (orders.needsSignIn) {
    return { content: orders.summary, uiBlocks: [] as AssistantUiBlock[] };
  }
  const target = orders.orders[0];
  if (!target) {
    return { content: orders.summary, uiBlocks: [] as AssistantUiBlock[] };
  }
  const products = uniqueOrderProducts(target.items);
  if (!looksLikeProblem(problem) || wantsOrderHelp(problem)) {
    return {
      content: `I have ${target.reference} (${target.statusLabel} · ${target.summary}). What went wrong — a missing part, damage in transit, or something else?`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  if (!target.claimable) {
    return {
      content: `${target.reference} is ${target.statusLabel}, so I cannot open a claim from chat. I can email support about “${problem}” if you want.`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const productLabel = resolveProductLabel(problem, products, selectedProduct);
  if (!productLabel && products.length > 1) {
    return {
      content: `Which product on ${target.reference} is this about?`,
      uiBlocks: [productPickerBlock(problem, target, products)] as AssistantUiBlock[],
    };
  }
  const label = productLabel || products[0]?.name || "the order";
  const reason = claimReason(problem, label, target.reference);
  return {
    content: `Got it — ${reason}. Confirm the claim below. Our customer support will contact you regarding your claim.`,
    uiBlocks: [
      {
        type: "confirm_claim" as const,
        orderId: target.id,
        reference: target.reference,
        reason,
        productName: label,
      },
    ],
  };
}

async function offerOrderHelp(actor: AssistantActor, problem: string, reference: string | null) {
  const listed = await toolMyOrders(actor, reference);
  if (listed.needsSignIn) {
    return { content: "Sign in as the customer who placed the order and I will list the ones I can help with.", uiBlocks: [] as AssistantUiBlock[] };
  }
  if (!listed.orders.length) {
    return { content: listed.summary, uiBlocks: [] as AssistantUiBlock[] };
  }
  if (reference || listed.orders.length === 1) {
    return continueOrderHelp(actor, listed.orders[0].reference, problem);
  }
  const picker = pickerBlock(problem, listed.orders);
  const intro = looksLikeProblem(problem)
    ? "I can help with that. Which order is this about?"
    : "I can help. Which order is this about?";
  return { content: intro, uiBlocks: [picker] as AssistantUiBlock[] };
}

function helpText(actor: AssistantActor) {
  if (!actor.id) {
    return "I’m Voltie. I can search the shop, explain shipping and returns, and send a note to support. Sign in if you want me to look at an order you placed — I never look up other people’s orders.";
  }
  if (isStaffRole(actor.role ?? "")) {
    return "I’m Voltie for shoppers. I can search the catalog and open a support ticket. Order lookup and claims are limited to the customer who owns the order.";
  }
  return "I’m Voltie. Ask about a product, shipping, or one of your orders. If something arrived wrong, I can open a claim after you confirm. I can also email support (that becomes a mock Jira ticket in this demo).";
}

async function ruleReply(
  actor: AssistantActor,
  text: string,
  lastOrder: string | null,
  picker: HelpPicker | null,
) {
  const resolved = resolveVoltieUtterance(text);
  if (resolved.ask.length) {
    return {
      content: `Did you mean “${resolved.ask[0]}”?`,
      uiBlocks: resolved.ask.map((suggestion) => ({ type: "did_you_mean" as const, suggestion })),
    };
  }
  const productPicker = picker?.type === "product_picker" ? picker : null;
  const orderPicker = picker?.type === "order_picker" ? picker : null;
  const choice = extractOrderChoice(resolved.text);
  if (choice && productPicker) {
    const picked = productPicker.items.find((item) => item.n === choice);
    if (!picked) {
      return {
        content: `Which product is this about? Tap a row or reply with 1 to ${productPicker.items.length}.`,
        uiBlocks: [productPicker] as AssistantUiBlock[],
      };
    }
    return continueOrderHelp(actor, productPicker.reference, productPicker.problem, picked.name);
  }
  if (productPicker) {
    const named = matchOrderProduct(resolved.text, productPicker.items);
    if (named) {
      const problem = looksLikeProblem(resolved.text) ? resolved.text : productPicker.problem;
      return continueOrderHelp(actor, productPicker.reference, problem, named.name);
    }
    if (looksLikeWholeOrder(resolved.text)) {
      return continueOrderHelp(actor, productPicker.reference, productPicker.problem, "the whole order");
    }
  }
  if (choice && orderPicker) {
    const picked = orderPicker.items.find((item) => item.n === choice);
    if (!picked) {
      return {
        content: `Which order is this about? Tap a row or reply with 1 to ${orderPicker.items.length}.`,
        uiBlocks: [orderPicker] as AssistantUiBlock[],
      };
    }
    return continueOrderHelp(actor, picked.reference, orderPicker.problem);
  }
  const grounded = applyThreadContext(resolved.intent, resolved.text, lastOrder);
  const intent = grounded.intent;
  const reference = grounded.reference;
  const note = resolved.note ? `${resolved.note} ` : "";
  const problem = looksLikeProblem(resolved.text) ? resolved.text : picker?.problem || resolved.text;
  if (wantsOrderHelp(resolved.text) || (looksLikeProblem(resolved.text) && (intent === "claim" || intent === "help"))) {
    return offerOrderHelp(actor, problem, reference);
  }

  if (intent === "search") {
    const found = await toolSearchCatalog(resolved.text);
    const blocks = catalogProductBlocks(found);
    return {
      content: blocks.length
        ? `${note}${found.summary} Open a product for specs, warranty, and stock.`
        : `${note}${found.summary} Try a brand or model name.`,
      uiBlocks: blocks,
    };
  }

  if (intent === "shipping" || intent === "returns" || intent === "warranty" || intent === "payments" || intent === "promos") {
    const info = await toolShopInfo(intent);
    return { content: `${note}${info.text}`, uiBlocks: [] as AssistantUiBlock[] };
  }

  if (intent === "orders") {
    const orders = await toolMyOrders(actor, reference);
    if (orders.needsSignIn) return { content: orders.summary, uiBlocks: [] as AssistantUiBlock[] };
    const latestOnly = !reference && wantsLatestOrder(resolved.text);
    const shown = latestOnly ? orders.orders.slice(0, 1) : orders.orders.slice(0, 5);
    const intro =
      latestOnly && shown[0]
        ? `Your latest order is ${shown[0].reference}.`
        : wantsOrderHelp(resolved.text) && shown.length
          ? "Which order do you need help with? I can check status, open a claim, or email support."
          : orders.summary;
    const lines = shown
      .map((order) => `${order.reference}: ${order.statusLabel} · ${order.summary}`)
      .join("\n");
    return {
      content: lines ? `${note}${intro}\n${lines}` : `${note}${orders.summary}`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }

  if (intent === "claim") {
    return offerOrderHelp(actor, problem, reference);
  }

  if (intent === "enquiry") {
    const email = extractEmail(text) || actor.email;
    if (!email) {
      return {
        content: "I can email support and open a ticket. Add the email we should reply to, plus what you want them to know.",
        uiBlocks: [] as AssistantUiBlock[],
      };
    }
    const ticket = await toolCreateEnquiry(actor, {
      subject: text.slice(0, 80),
      message: text,
      email,
      orderReference: reference,
    });
    return {
      content: `Sent to support as ${ticket.reference} (demo Jira key ${ticket.externalKey}). Check Mailpit for the Jira-shaped email.`,
      uiBlocks: [{ type: "ticket", reference: ticket.reference, externalKey: ticket.externalKey }],
    };
  }

  if (reference) {
    return {
      content: `We were looking at ${reference}. I can check its status, open a claim if something is wrong, or email support. What should I do?`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  return { content: helpText(actor), uiBlocks: [] as AssistantUiBlock[] };
}

export const assistantService = {
  async createThread(userId?: string) {
    const thread = await prisma.assistantThread.create({
      data: { userId: userId ?? null },
    });
    return { id: thread.id };
  },

  async listMessages(threadId: string, userId?: string) {
    await assertThread(threadId, userId);
    const items = await prisma.assistantMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: 80,
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        uiBlocks: asBlocks(row.uiBlocks),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },

  async chat(threadId: string, input: unknown, userId?: string) {
    const dto = assistantMessageSchema.parse(input);
    const thread = await assertThread(threadId, userId);
    const actor = await loadActor(thread.userId ?? userId);
    await prisma.assistantMessage.create({
      data: { threadId, role: "user", content: dto.content },
    });
    let spoken = dto.content;
    if (/^(yes|yeah|yep|ok|okay|please|y)$/i.test(spoken.trim())) {
      const previous = await prisma.assistantMessage.findFirst({
        where: { threadId, role: "assistant" },
        orderBy: { createdAt: "desc" },
      });
      const suggestion = asBlocks(previous?.uiBlocks ?? null).find((block) => block.type === "did_you_mean");
      if (suggestion) spoken = suggestion.suggestion;
    }
    const recent = await prisma.assistantMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { content: true, uiBlocks: true },
    });
    const lastOrder = lastOrderFromTranscript(recent.slice().reverse());
    const picker = recent.map((row) => lastHelpPicker(asBlocks(row.uiBlocks))).find((block) => block) ?? null;
    const reply = isStaffRole(actor.role ?? "")
      ? await staffRuleReply(actor, spoken, lastOrder)
      : await ruleReply(actor, spoken, lastOrder, picker);
    const saved = await prisma.assistantMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: reply.content,
        uiBlocks: reply.uiBlocks.length ? reply.uiBlocks : Prisma.JsonNull,
      },
    });
    await prisma.assistantThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return {
      id: saved.id,
      role: "assistant",
      content: saved.content,
      uiBlocks: reply.uiBlocks,
    };
  },

  async enquiry(threadId: string, input: unknown, userId?: string) {
    const dto = assistantEnquirySchema.parse(input);
    const thread = await assertThread(threadId, userId);
    const actor = await loadActor(thread.userId ?? userId);
    if (isStaffRole(actor.role ?? "")) {
      throw new HttpError(403, "Use the staff chat for lookups. Customer enquiries stay on the shop widget.");
    }
    const ticket = await toolCreateEnquiry(actor, dto);
    const content = `Sent to support as ${ticket.reference} (demo Jira key ${ticket.externalKey}).`;
    const uiBlocks: AssistantUiBlock[] = [
      { type: "ticket", reference: ticket.reference, externalKey: ticket.externalKey },
    ];
    await prisma.assistantMessage.create({
      data: { threadId, role: "assistant", content, uiBlocks },
    });
    return { content, uiBlocks, ticket };
  },

  async claim(threadId: string, input: unknown, userId?: string) {
    const dto = assistantClaimSchema.parse(input);
    const thread = await assertThread(threadId, userId);
    const actor = await loadActor(thread.userId ?? userId);
    if (isStaffRole(actor.role ?? "")) {
      throw new HttpError(403, "Staff cannot open a customer claim from Voltie.");
    }
    const result = await toolConfirmClaim(actor, dto.orderId, dto.reason, dto.productName);
    const content = `Claim opened on ${result.reference}. Ticket ${result.ticket.reference} / ${result.ticket.externalKey}. Our customer support will contact you regarding your claim.`;
    const uiBlocks: AssistantUiBlock[] = [
      { type: "ticket", reference: result.ticket.reference, externalKey: result.ticket.externalKey },
    ];
    await prisma.assistantMessage.create({
      data: { threadId, role: "assistant", content, uiBlocks },
    });
    return { content, uiBlocks, ticket: result.ticket, reference: result.reference };
  },

  async staffAction(threadId: string, input: unknown, userId?: string) {
    const dto = assistantStaffActionSchema.parse(input);
    const thread = await assertThread(threadId, userId);
    const actor = await loadActor(thread.userId ?? userId);
    if (!isStaffRole(actor.role ?? "")) {
      throw new HttpError(403, "Staff access required");
    }
    const reply = await staffConfirmAction(actor, dto);
    const saved = await prisma.assistantMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: reply.content,
        uiBlocks: reply.uiBlocks.length ? reply.uiBlocks : Prisma.JsonNull,
      },
    });
    await prisma.assistantThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return {
      id: saved.id,
      role: "assistant",
      content: saved.content,
      uiBlocks: reply.uiBlocks,
    };
  },
};
