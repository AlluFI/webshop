import { assistantStaffActionSchema } from "@volt/shared";
import { extractOrderReference, softenVoltieText } from "./voltie-intent.js";
import {
  classifyStaffVoltieIntent,
  extractStaffStatus,
  staffCustomerQuery,
  staffInventoryMode,
  staffInventoryQuery,
  staffProductQuery,
  staffWholesalerQuery,
} from "./staff-voltie-intent.js";
import {
  applyStaffAction,
  staffHelpText,
  toolStaffCustomer,
  toolStaffInventory,
  toolStaffLocator,
  toolStaffOrder,
  toolStaffPicking,
  toolStaffRefundOffer,
  toolStaffSales,
  toolStaffSearch,
  toolStaffStatusOffer,
  toolStaffTickets,
  toolStaffWholesaler,
} from "./staff-assistant-tools.js";
import type { AssistantActor, AssistantUiBlock } from "./assistant-tools.js";

function refundReasonFrom(text: string) {
  const value = text.toLowerCase();
  if (/\b(wrong|damaged|ripped|broken|faulty)\b/.test(value)) return "wrong_or_damaged";
  if (/\b(never arrived|too late|lost)\b/.test(value)) return "never_arrived";
  if (/\bshop error|our (fault|mistake)\b/.test(value)) return "shop_error";
  return "customer_requested";
}

export async function staffRuleReply(
  actor: AssistantActor,
  text: string,
  lastOrder: string | null,
): Promise<{ content: string; uiBlocks: AssistantUiBlock[] }> {
  const spoken = softenVoltieText(text).text;
  const intent = classifyStaffVoltieIntent(spoken);
  const mentioned = extractOrderReference(spoken);
  const reference = mentioned ?? lastOrder;
  const status = extractStaffStatus(spoken);

  if (intent === "picking") return toolStaffPicking(actor);
  if (intent === "inventory") {
    return toolStaffInventory(actor, staffInventoryMode(spoken), staffInventoryQuery(spoken));
  }
  if (intent === "locator") return toolStaffLocator(actor, staffProductQuery(spoken));
  if (intent === "wholesaler") return toolStaffWholesaler(actor, staffWholesalerQuery(spoken));
  if (intent === "tickets") return toolStaffTickets(actor);
  if (intent === "customer") return toolStaffCustomer(actor, staffCustomerQuery(spoken));
  if (intent === "sales") return toolStaffSales(actor);
  if (intent === "search") return toolStaffSearch(actor, spoken);
  if (intent === "refund") return toolStaffRefundOffer(actor, reference, refundReasonFrom(spoken));
  if (intent === "status" && status) return toolStaffStatusOffer(actor, reference, status);
  if (intent === "order") return toolStaffOrder(actor, mentioned);
  return { content: staffHelpText(actor.role ?? ""), uiBlocks: [] };
}

export async function staffConfirmAction(actor: AssistantActor, input: unknown) {
  const dto = assistantStaffActionSchema.parse(input);
  return applyStaffAction(actor, dto);
}
