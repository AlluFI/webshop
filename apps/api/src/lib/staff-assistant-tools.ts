import {
  can,
  formatLocatorCode,
  formatOrderStatus,
  isStaffRole,
  LOW_STOCK_THRESHOLD,
  STAFF_REFUNDABLE_STATUSES,
  suggestedRestockQty,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { adminService } from "../services/admin.service.js";
import { salesService } from "../services/sales.service.js";
import { toolSearchCatalog, type AssistantActor, type AssistantUiBlock } from "./assistant-tools.js";
import { listSupportTickets } from "./tickets.js";

type StaffOrder = NonNullable<Awaited<ReturnType<typeof findOrderByStaffReference>>>;
type StaffReply = { content: string; uiBlocks: AssistantUiBlock[]; order?: StaffOrder };

function roleName(actor: AssistantActor) {
  return actor.role ?? "";
}

function deny(action: string): StaffReply {
  return {
    content: `Your role cannot ${action}. I only answer from records I am allowed to see.`,
    uiBlocks: [],
  };
}

function euro(value: number) {
  return `€${value.toFixed(2)}`;
}

export function staffHelpText(role: string) {
  const bits: string[] = [];
  if (can(role, "orders")) bits.push("look up an order by VC- number");
  if (can(role, "customers")) bits.push("find a customer by name or email");
  if (can(role, "picking")) bits.push("show the pick list");
  if (can(role, "products")) bits.push("find a warehouse locator or barcode");
  else if (can(role, "orders")) bits.push("read a locator from an order line");
  if (can(role, "products")) bits.push("list products that are low on stock");
  if (can(role, "products") || can(role, "catalog")) bits.push("say which wholesaler supplies a brand or SKU");
  if (can(role, "tickets")) bits.push("list open tickets");
  if (can(role, "sales")) bits.push("summarise the last 7 days of sales");
  if (can(role, "refunds")) bits.push("offer a confirmed refund");
  if (can(role, "orders")) {
    bits.push("offer a confirmed status change (not With the courier — use Order handling for that)");
  }
  const who = isStaffRole(role) ? role : "staff";
  return `I’m Voltie for ${who}. I can ${bits.join("; ")}. I never change an order until you tap Confirm.`;
}

export async function findOrderByStaffReference(reference: string) {
  const hex = reference.replace(/^VC-/i, "").replaceAll("-", "").slice(0, 8).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(hex)) return null;
  const row = await prisma.order.findFirst({
    where: { id: { startsWith: `${hex}-` } },
    select: { id: true },
  });
  if (!row) return null;
  return adminService.getOrder(row.id);
}

function describeOrder(role: string, order: StaffOrder) {
  const lines = order.items
    .map((item) => `${item.quantity}× ${item.name}${item.locatorCode ? ` @ ${item.locatorCode}` : ""}`)
    .join(", ");
  const bits = [`${order.reference} is ${formatOrderStatus(order.status)}.`, euro(order.total), lines || "no line items"];
  if (can(role, "customers")) {
    bits.push(order.displayName || "guest");
    bits.push(order.email || "no email on file");
  }
  if (order.tracking) bits.push(`${order.tracking.carrierName} ${order.tracking.code}`);
  return bits.join(" · ");
}

export async function toolStaffOrder(actor: AssistantActor, reference: string | null): Promise<StaffReply> {
  if (!can(roleName(actor), "orders")) return deny("look up orders");
  if (!reference) {
    return {
      content: "Give me a Volt order number (VC- plus 8 characters) and I will look it up.",
      uiBlocks: [],
    };
  }
  const order = await findOrderByStaffReference(reference);
  if (!order) {
    return { content: `No order ${reference} in the shop.`, uiBlocks: [] };
  }
  return { content: describeOrder(roleName(actor), order), uiBlocks: [], order };
}

export async function toolStaffCustomer(actor: AssistantActor, query: string) {
  if (!can(roleName(actor), "customers")) return deny("look up customers");
  if (query.length < 2) {
    return {
      content: "Give me a customer name or email. I will not guess from a first name alone if several people match.",
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const listed = await adminService.listCustomers({ q: query, pageSize: 5 });
  if (!listed.items.length) {
    return { content: `No customer matched “${query}”.`, uiBlocks: [] as AssistantUiBlock[] };
  }
  if (listed.items.length > 1) {
    const lines = listed.items.map((row) => {
      const name = row.displayName || "Unnamed";
      const email = row.email || "no email";
      const gone = row.deletedAt ? " (deleted)" : "";
      return `${name} · ${email}${gone}`;
    });
    return {
      content: `Several customers matched “${query}”. Say which email:\n${lines.join("\n")}`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const detail = await adminService.getCustomer(listed.items[0].id);
  const who = `${detail.displayName || "Unnamed"} · ${detail.email || "no email"}`;
  if (!detail.orders.length) {
    return { content: `${who}\nNo orders on this account.`, uiBlocks: [] as AssistantUiBlock[] };
  }
  const orders = detail.orders.slice(0, 8).map((order) => {
    const summary = order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
    return `${order.reference} · ${formatOrderStatus(order.status)} · ${euro(order.total)} · ${summary}`;
  });
  const extra = detail.orders.length > orders.length ? `\n…and ${detail.orders.length - orders.length} more.` : "";
  return {
    content: `${who}\n${detail.orders.length} order(s):\n${orders.join("\n")}${extra}`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

export async function toolStaffPicking(actor: AssistantActor) {
  if (!can(roleName(actor), "picking")) return deny("see the pick list");
  const listed = await adminService.listPicking();
  if (!listed.items.length) {
    return { content: "The pick list is empty. Nothing in Paid, Processing, or Shipping.", uiBlocks: [] as AssistantUiBlock[] };
  }
  const showName = can(roleName(actor), "customers");
  const lines = listed.items.slice(0, 8).map((order) => {
    const locators = order.items
      .map((item) => `${item.quantity}× ${item.name} @ ${item.locatorCode}`)
      .join("; ");
    const who = showName && order.customerName ? ` · ${order.customerName}` : "";
    return `${order.reference} · ${formatOrderStatus(order.status)}${who} · ${locators}`;
  });
  const extra = listed.total > lines.length ? `\n…and ${listed.total - lines.length} more on Order handling.` : "";
  return {
    content: `${listed.total} unpicked order(s) in the queue:\n${lines.join("\n")}${extra}`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

export async function toolStaffLocator(actor: AssistantActor, query: string) {
  if (!query) {
    return { content: "Tell me a product name or barcode and I will look up the locator.", uiBlocks: [] as AssistantUiBlock[] };
  }
  if (can(roleName(actor), "products")) {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { barcode: { contains: query.toUpperCase(), mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        name: true,
        barcode: true,
        stockQuantity: true,
        locatorStation: true,
        locatorBlock: true,
        locatorShelf: true,
        locatorPlace: true,
      },
    });
    if (products.length) {
      const lines = products.map((product) => {
        const code = formatLocatorCode(
          product.locatorStation,
          product.locatorBlock,
          product.locatorShelf,
          product.locatorPlace,
        );
        const barcode = product.barcode ? ` · ${product.barcode}` : "";
        return `${product.name} @ ${code}${barcode} · stock ${product.stockQuantity}`;
      });
      return { content: lines.join("\n"), uiBlocks: [] as AssistantUiBlock[] };
    }
  }
  if (!can(roleName(actor), "orders")) return deny("look up warehouse locators");
  const items = await prisma.orderItem.findMany({
    where: { productName: { contains: query, mode: "insensitive" } },
    orderBy: { id: "desc" },
    take: 8,
    select: {
      productName: true,
      locatorCode: true,
      quantity: true,
      order: { select: { id: true, status: true } },
    },
  });
  const seen = new Map<string, string>();
  for (const item of items) {
    if (!item.locatorCode || seen.has(item.productName)) continue;
    seen.set(item.productName, `${item.productName} @ ${item.locatorCode} (from a ${formatOrderStatus(item.order.status)} order)`);
  }
  if (!seen.size) {
    return { content: `No locator found for “${query}”.`, uiBlocks: [] as AssistantUiBlock[] };
  }
  return { content: [...seen.values()].join("\n"), uiBlocks: [] as AssistantUiBlock[] };
}

export async function toolStaffWholesaler(actor: AssistantActor, query: string) {
  if (!can(roleName(actor), "products") && !can(roleName(actor), "catalog")) {
    return deny("see wholesalers");
  }
  if (!query) {
    const listed = await adminService.listWholesalers();
    if (!listed.items.length) {
      return { content: "No wholesalers are on file.", uiBlocks: [] as AssistantUiBlock[] };
    }
    const lines = listed.items.map((row) => `${row.name} · ${row.productCount} product(s) · ${row.email}`);
    return { content: `Wholesalers:\n${lines.join("\n")}`, uiBlocks: [] as AssistantUiBlock[] };
  }
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { brand: { name: { contains: query, mode: "insensitive" } } },
        { brand: { slug: { equals: query.toLowerCase() } } },
        { wholesaler: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    take: 24,
    orderBy: { name: "asc" },
    select: {
      name: true,
      brand: { select: { name: true } },
      wholesaler: { select: { name: true, email: true } },
    },
  });
  if (!products.length) {
    return { content: `No wholesaler or product matched “${query}”.`, uiBlocks: [] as AssistantUiBlock[] };
  }
  const groups = new Map<string, { email: string | null; products: string[] }>();
  const unassigned: string[] = [];
  for (const product of products) {
    if (!product.wholesaler) {
      unassigned.push(product.name);
      continue;
    }
    const current = groups.get(product.wholesaler.name) ?? { email: product.wholesaler.email, products: [] };
    if (current.products.length < 6) current.products.push(product.name);
    groups.set(product.wholesaler.name, current);
  }
  if (!groups.size) {
    return {
      content: `No wholesaler is assigned for “${query}”. Check Products on Admin.`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const lines = [...groups.entries()].map(([name, row]) => {
    const mail = row.email ? ` (${row.email})` : "";
    return `${name}${mail}: ${row.products.join(", ")}`;
  });
  const extra = unassigned.length ? `\n${unassigned.length} product(s) have no wholesaler.` : "";
  return {
    content: `Wholesaler(s) for “${query}”:\n${lines.join("\n")}${extra}`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

function describeStock(product: {
  name: string;
  stockQuantity: number;
  locatorStation: number;
  locatorBlock: number;
  locatorShelf: number;
  locatorPlace: number;
}) {
  const code = formatLocatorCode(
    product.locatorStation,
    product.locatorBlock,
    product.locatorShelf,
    product.locatorPlace,
  );
  const restock = suggestedRestockQty(product.stockQuantity);
  const hint = restock ? ` · restock ${restock}` : "";
  return `${product.name} · ${product.stockQuantity} on hand @ ${code}${hint}`;
}

export async function toolStaffInventory(
  actor: AssistantActor,
  mode: "low" | "out" | "lookup",
  query: string,
) {
  if (!can(roleName(actor), "products")) return deny("see product inventory");
  const select = {
    name: true,
    stockQuantity: true,
    locatorStation: true,
    locatorBlock: true,
    locatorShelf: true,
    locatorPlace: true,
  } as const;

  if (mode === "lookup" && query) {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { barcode: { contains: query.toUpperCase(), mode: "insensitive" } },
        ],
      },
      take: 8,
      orderBy: { stockQuantity: "asc" },
      select,
    });
    if (!products.length) {
      return { content: `No product matched “${query}” in inventory.`, uiBlocks: [] as AssistantUiBlock[] };
    }
    return { content: products.map(describeStock).join("\n"), uiBlocks: [] as AssistantUiBlock[] };
  }

  const where = mode === "out" ? { stockQuantity: 0 } : { stockQuantity: { lt: LOW_STOCK_THRESHOLD } };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
      take: 8,
      select,
    }),
  ]);
  if (!products.length) {
    return {
      content:
        mode === "out"
          ? "Nothing is out of stock."
          : `Nothing is below the low-stock threshold (${LOW_STOCK_THRESHOLD} units).`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const extra = total > products.length ? `\n…and ${total - products.length} more on Products.` : "";
  const heading =
    mode === "out"
      ? `${total} product(s) out of stock:`
      : `${total} product(s) below ${LOW_STOCK_THRESHOLD} on hand:`;
  return {
    content: `${heading}\n${products.map(describeStock).join("\n")}${extra}`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

export async function toolStaffTickets(actor: AssistantActor) {
  if (!can(roleName(actor), "tickets")) return deny("see support tickets");
  const listed = await listSupportTickets();
  const open = listed.items.filter((row) => row.status !== "DONE").slice(0, 8);
  if (!open.length) {
    return { content: `Ticket inbox is empty (${listed.mode} mode).`, uiBlocks: [] as AssistantUiBlock[] };
  }
  const lines = open.map((row) => {
    const order = row.orderId ? " · has order" : "";
    return `${row.reference} / ${row.externalKey} · ${row.kind} · ${row.status} · ${row.subject}${order}`;
  });
  return {
    content: `Open tickets (${listed.mode}):\n${lines.join("\n")}`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

export async function toolStaffSales(actor: AssistantActor) {
  if (!can(roleName(actor), "sales")) return deny("see sales reports");
  const report = await salesService.overview({ range: "last_7_days" });
  const totals = report.totals;
  return {
    content: `Last 7 days (${report.from} to ${report.to}): ${totals.orders} orders, ${euro(totals.customerAmount)} customer amount, ${euro(totals.refunds)} refunds, ${euro(totals.netSales)} net, AOV ${euro(totals.aov)}.`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}

export async function toolStaffSearch(actor: AssistantActor, text: string) {
  if (!can(roleName(actor), "products") && !can(roleName(actor), "catalog")) {
    return {
      content: "I cannot search the catalog on this role. Give me a VC- number and I can read the line items.",
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const found = await toolSearchCatalog(text);
  return {
    content: found.summary,
    uiBlocks: found.products.length
      ? ([{ type: "products", items: found.products }] as AssistantUiBlock[])
      : ([] as AssistantUiBlock[]),
  };
}

export async function toolStaffRefundOffer(actor: AssistantActor, reference: string | null, reason: string) {
  if (!can(roleName(actor), "refunds")) return deny("refund orders");
  const looked = await toolStaffOrder(actor, reference);
  if (!looked.order) return looked;
  const order = looked.order;
  if (!(STAFF_REFUNDABLE_STATUSES as readonly string[]).includes(order.status)) {
    return {
      content: `${order.reference} is ${formatOrderStatus(order.status)}, so it cannot be refunded from chat.`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  return {
    content: `Confirm the refund of ${order.reference} (${euro(order.total)}). This writes to the order — I will not do it until you tap the button.`,
    uiBlocks: [
      {
        type: "confirm_refund",
        orderId: order.id,
        reference: order.reference,
        reason,
      },
    ] as AssistantUiBlock[],
  };
}

export async function toolStaffStatusOffer(
  actor: AssistantActor,
  reference: string | null,
  status: string,
) {
  if (!can(roleName(actor), "orders")) return deny("change order status");
  if (status === "WITH_COURIER") {
    return {
      content:
        "Handing an order to the courier needs a carrier and tracking code. Use Order handling on Admin — I will not confirm that from chat.",
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const looked = await toolStaffOrder(actor, reference);
  if (!looked.order) return looked;
  const order = looked.order;
  if (order.status === status) {
    return {
      content: `${order.reference} is already ${formatOrderStatus(status)}.`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  const note = status === "CLAIMS" ? "Moved to claims from Voltie" : undefined;
  return {
    content: `Confirm setting ${order.reference} from ${formatOrderStatus(order.status)} to ${formatOrderStatus(status)}. I will not change it until you tap the button.`,
    uiBlocks: [
      {
        type: "confirm_status",
        orderId: order.id,
        reference: order.reference,
        status,
        note,
      },
    ] as AssistantUiBlock[],
  };
}

export async function applyStaffAction(
  actor: AssistantActor,
  dto:
    | { action: "status"; orderId: string; status: string; note?: string }
    | { action: "refund"; orderId: string; reason: string; note?: string },
) {
  if (!actor.id || !isStaffRole(roleName(actor))) {
    throw new HttpError(403, "Staff access required");
  }
  if (dto.action === "status") {
    if (!can(roleName(actor), "orders")) throw new HttpError(403, "You do not have permission for this action");
    if (dto.status === "WITH_COURIER") {
      throw new HttpError(400, "Use Order handling to hand an order to the courier.");
    }
    const note =
      dto.status === "CLAIMS" ? dto.note?.trim() || "Moved to claims from Voltie" : dto.note;
    const order = await adminService.setOrderStatus(actor.id, dto.orderId, { status: dto.status, note });
    return {
      content: `${order.reference} is now ${formatOrderStatus(order.status)}.`,
      uiBlocks: [] as AssistantUiBlock[],
    };
  }
  if (!can(roleName(actor), "refunds")) throw new HttpError(403, "You do not have permission for this action");
  const order = await adminService.refund(actor.id, dto.orderId, { reason: dto.reason, note: dto.note });
  return {
    content: `${order.reference} is now ${formatOrderStatus(order.status)}. Refund recorded.`,
    uiBlocks: [] as AssistantUiBlock[],
  };
}
