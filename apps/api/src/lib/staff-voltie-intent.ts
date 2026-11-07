import { ORDER_STATUSES } from "@volt/shared";
import { extractEmail, extractOrderReference, searchQueryFrom } from "./voltie-intent.js";

export type StaffVoltieIntent =
  | "order"
  | "customer"
  | "picking"
  | "locator"
  | "inventory"
  | "wholesaler"
  | "tickets"
  | "claim_orders"
  | "sales"
  | "refund"
  | "status"
  | "search"
  | "help";

export type StaffInventoryMode = "low" | "out" | "lookup";

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

const STATUS_CUES: { status: OrderStatusName; pattern: RegExp }[] = [
  { status: "PROCESSING", pattern: /\b(process(ing)?|start pick|begin pick)\b/i },
  { status: "SHIPPING", pattern: /\b(mark as shipping|to shipping)\b/i },
  { status: "WITH_COURIER", pattern: /\b(hand(ed)?\b.*\b(the )?courier|with the courier)\b/i },
  { status: "DELIVERED", pattern: /\b(mark as delivered|set to delivered|delivered)\b/i },
  { status: "CLAIMS", pattern: /\b(move to claims|mark as claims|set to claims)\b/i },
  { status: "CANCELLED", pattern: /\b(cancel(led)? the order|mark as cancelled)\b/i },
  { status: "PAID", pattern: /\b(back to paid|set to paid|mark as paid)\b/i },
];

export function extractStaffStatus(text: string): OrderStatusName | null {
  for (const cue of STATUS_CUES) {
    if (cue.pattern.test(text)) return cue.status;
  }
  return null;
}

export function classifyStaffVoltieIntent(text: string): StaffVoltieIntent {
  const value = text.toLowerCase();
  if (
    /\b(pick list|picking queue|order handling|what (do i|to) pick|warehouse queue|to pick|unpicked|un-picked|pick queue|orders? in (the )?queue|in (the )?(picking )?queue)\b/.test(
      value,
    )
  ) {
    return "picking";
  }
  if (/\b(tickets?|jira|open claims?|claims queue|support inbox)\b/.test(value)) {
    return "tickets";
  }
  if (
    /\b(orders? (with|in|on) claims?|claims? orders?|in claims|with a claim)\b/.test(value)
  ) {
    return "claim_orders";
  }
  if (/\brefund/.test(value)) return "refund";
  if (extractStaffStatus(text)) return "status";
  if (extractOrderReference(text) || /\b(find (the )?order|look up (the )?order|order VC-|status of (the )?order)\b/.test(value)) {
    return "order";
  }
  if (
    /\b(low on stock|low stock|out of stock|sold out|inventory|restock|how much stock|how many .*stock|stock of|stock for|stock left|running low)\b/.test(
      value,
    )
  ) {
    return "inventory";
  }
  if (
    /\b(locator( codes?)?|where (is|are)|stock location|warehouse location|bar[\s-]?codes?)\b/.test(
      value,
    )
  ) {
    return "locator";
  }
  if (/\b(wholesaler|supplier|who supplies|supplied by|who (is|are) the (wholesaler|supplier))\b/.test(value)) {
    return "wholesaler";
  }
  if (
    /\b(find (the )?customer|look up (the )?customer|customer (named|email)|who is|whose account|orders? for|orders? of (the )?user)\b/.test(
      value,
    ) || extractEmail(text)
  ) {
    return "customer";
  }
  if (
    /\b(sales?|revenue|how much (did we|have we)|last (\d+ )?days|last (week|month)|overview|this week|7 days)\b/.test(
      value,
    )
  ) {
    return "sales";
  }
  if (
    /\b(find|search|looking for|recommend|do you sell|available|headphones?|earbuds?|earphones?|headset|laptops?|phones?|watches?|sony|bose|macbook|catalog|products?)\b/.test(
      value,
    ) || /^(show|list)\b/.test(value)
  ) {
    return "search";
  }
  return "help";
}

const PRODUCT_FILLER =
  /\b(what|which|where|is|are|the|a|an|for|of|please|me|tell|give|get|show|find|locator|locators|location|warehouse|stock location|bar[\s-]?codes?|codes?)\b/gi;

export function staffProductQuery(text: string) {
  return searchQueryFrom(text.replace(PRODUCT_FILLER, " ").replace(/\s+/g, " ").trim());
}

export function staffInventoryQuery(text: string) {
  return searchQueryFrom(
    text
      .replace(
        /\b(what|which|whose|show|me|list|available|please|products?|items?|skus?|are|is|low|on|of|the|a|an|stock|stocks|inventory|inventories|restock|restocks|out of|running|how much|how many|do we have|left|below|threshold|levels?|qty|quantity|sold out)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function staffInventoryMode(text: string): StaffInventoryMode {
  const query = staffInventoryQuery(text);
  if (query.length >= 2) return "lookup";
  if (/\b(out of stock|zero stock|no stock|sold out)\b/i.test(text)) return "out";
  return "low";
}

export function staffWholesalerQuery(text: string) {
  return searchQueryFrom(
    text
      .replace(
        /\b(which|who|what|is|are|the|a|an|for|of|wholesaler|wholesalers|supplier|suppliers|supplies|supplied|by|products?|brand)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function staffCustomerQuery(text: string) {
  const email = extractEmail(text);
  if (email) return email;
  return text
    .replace(/\b(find|look up|show|who is|customer|named|email|account|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
