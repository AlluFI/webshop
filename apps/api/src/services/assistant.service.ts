import { Prisma } from "@prisma/client";
import {
  assistantClaimSchema,
  assistantEnquirySchema,
  assistantMessageSchema,
  isStaffRole,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import {
  toolConfirmClaim,
  toolCreateEnquiry,
  toolMyOrders,
  toolSearchCatalog,
  toolShopInfo,
  type AssistantActor,
  type AssistantUiBlock,
} from "../lib/assistant-tools.js";
import { extractEmail, extractOrderReference, resolveVoltieUtterance, wantsLatestOrder } from "../lib/voltie-intent.js";

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

function helpText(actor: AssistantActor) {
  if (!actor.id) {
    return "I’m Voltie. I can search the shop, explain shipping and returns, and send a note to support. Sign in if you want me to look at an order you placed — I never look up other people’s orders.";
  }
  if (isStaffRole(actor.role ?? "")) {
    return "I’m Voltie for shoppers. I can search the catalog and open a support ticket. Order lookup and claims are limited to the customer who owns the order.";
  }
  return "I’m Voltie. Ask about a product, shipping, or one of your orders. If something arrived wrong, I can open a claim after you confirm. I can also email support (that becomes a mock Jira ticket in this demo).";
}

async function ruleReply(actor: AssistantActor, text: string) {
  const resolved = resolveVoltieUtterance(text);
  if (resolved.ask.length) {
    return {
      content: `Did you mean “${resolved.ask[0]}”?`,
      uiBlocks: resolved.ask.map((suggestion) => ({ type: "did_you_mean" as const, suggestion })),
    };
  }
  const intent = resolved.intent;
  const reference = extractOrderReference(resolved.text);
  const note = resolved.note ? `${resolved.note} ` : "";

  if (intent === "search") {
    const found = await toolSearchCatalog(resolved.text);
    return {
      content: found.products.length
        ? `${note}${found.summary} Open a product for specs, warranty, and stock.`
        : `${note}${found.summary} Try a brand or model name.`,
      uiBlocks: found.products.length ? [{ type: "products" as const, items: found.products }] : [],
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
    const orders = await toolMyOrders(actor, reference);
    if (orders.needsSignIn) {
      return { content: "Sign in to open a claim on an order you placed.", uiBlocks: [] as AssistantUiBlock[] };
    }
    const claimable = orders.orders.filter((order) => order.claimable);
    const target = claimable[0];
    if (!target) {
      return {
        content: orders.orders.length
          ? "None of those orders can move to claims from chat (already claimed, cancelled, or unpaid)."
          : orders.summary,
        uiBlocks: [] as AssistantUiBlock[],
      };
    }
    const reason = text.trim();
    return {
      content: `I can open a claim on ${target.reference}. Confirm below and support will get a ticket (mock Jira key in this demo). Picking pauses while the order is in Claims.`,
      uiBlocks: [{ type: "confirm_claim", orderId: target.id, reference: target.reference, reason }],
    };
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
    const reply = await ruleReply(actor, spoken);
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
    const result = await toolConfirmClaim(actor, dto.orderId, dto.reason);
    const content = `Claim opened on ${result.reference}. Ticket ${result.ticket.reference} / ${result.ticket.externalKey}. Order handling is paused.`;
    const uiBlocks: AssistantUiBlock[] = [
      { type: "ticket", reference: result.ticket.reference, externalKey: result.ticket.externalKey },
    ];
    await prisma.assistantMessage.create({
      data: { threadId, role: "assistant", content, uiBlocks },
    });
    return { content, uiBlocks, ticket: result.ticket, reference: result.reference };
  },
};
