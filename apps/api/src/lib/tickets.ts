import { formatTicketReference } from "@volt/shared";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { mail } from "../mail.js";

export type TicketDraft = {
  kind: "ENQUIRY" | "CLAIM";
  subject: string;
  message: string;
  customerName: string;
  customerEmail: string;
  userId?: string | null;
  orderId?: string | null;
  orderReference?: string | null;
};

export type JiraShapedIssue = {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: string;
    labels: string[];
    customfield_order?: string;
  };
};

export function jiraPayload(draft: TicketDraft, reference: string, externalKey: string): JiraShapedIssue {
  return {
    fields: {
      project: { key: "VOLT" },
      issuetype: { name: draft.kind === "CLAIM" ? "Bug" : "Task" },
      summary: `[${reference}] ${draft.subject}`,
      description: [
        draft.message,
        "",
        `Customer: ${draft.customerName} <${draft.customerEmail}>`,
        draft.orderReference ? `Order: ${draft.orderReference}` : null,
        `Volt ticket: ${reference}`,
        `External key: ${externalKey}`,
      ]
        .filter(Boolean)
        .join("\n"),
      labels: ["voltie", draft.kind.toLowerCase()],
      customfield_order: draft.orderReference ?? undefined,
    },
  };
}

async function nextExternalKey() {
  const count = await prisma.supportTicket.count();
  return `VOLT-${count + 1}`;
}

async function deliverLive(payload: JiraShapedIssue) {
  if (!config.ticketWebhookUrl) {
    throw new Error("TICKET_WEBHOOK_URL is empty");
  }
  const response = await fetch(config.ticketWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`Ticketing webhook HTTP ${response.status}`);
  }
}

export async function createSupportTicket(draft: TicketDraft) {
  const id = crypto.randomUUID();
  const reference = formatTicketReference(id);
  const externalKey = await nextExternalKey();
  const payload = jiraPayload(draft, reference, externalKey);
  let lastError: string | null = null;

  if (config.ticketMode === "live") {
    try {
      await deliverLive(payload);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Ticketing webhook failed";
    }
  }

  const row = await prisma.supportTicket.create({
    data: {
      id,
      reference,
      externalKey,
      kind: draft.kind,
      subject: draft.subject,
      message: draft.message,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      userId: draft.userId ?? null,
      orderId: draft.orderId ?? null,
      payloadJson: JSON.stringify(payload),
      lastError,
    },
  });

  await mail.sendSupportTicket({
    reference,
    externalKey,
    mode: config.ticketMode,
    payload,
    lastError,
  });

  return {
    id: row.id,
    reference: row.reference,
    externalKey: row.externalKey,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    mode: config.ticketMode,
    lastError,
  };
}

export async function listSupportTickets() {
  const items = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { order: { select: { id: true } } },
  });
  return {
    mode: config.ticketMode,
    items: items.map((row) => ({
      id: row.id,
      reference: row.reference,
      externalKey: row.externalKey,
      kind: row.kind,
      status: row.status,
      subject: row.subject,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      orderId: row.orderId,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
