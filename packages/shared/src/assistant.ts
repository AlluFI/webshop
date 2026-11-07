import { z } from "zod";
import { emailSchema } from "./auth.js";
import { ORDER_STATUSES } from "./checkout.js";

export const SUPPORT_TICKET_KINDS = ["ENQUIRY", "CLAIM"] as const;
export const SUPPORT_TICKET_STATUSES = ["OPEN", "PENDING", "DONE"] as const;

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1, "Write a message").max(2000),
});

export const assistantEnquirySchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(4000),
  name: z.string().trim().min(1).max(80).optional(),
  email: emailSchema.optional(),
  orderReference: z.string().trim().max(20).optional(),
});

export const assistantClaimSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(8, "Describe the problem").max(1000),
  productName: z.string().trim().max(160).optional(),
});

export const assistantStaffActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    orderId: z.string().uuid(),
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(240).optional(),
  }),
  z.object({
    action: z.literal("refund"),
    orderId: z.string().uuid(),
    reason: z.enum(["customer_requested", "shop_error", "wrong_or_damaged", "never_arrived", "other"]).default("customer_requested"),
    note: z.string().trim().max(240).optional(),
  }),
]);

export function formatTicketReference(id: string) {
  return `VD-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export const CUSTOMER_CLAIMABLE_STATUSES = [
  "PAID",
  "PROCESSING",
  "SHIPPING",
  "WITH_COURIER",
  "DELIVERED",
] as const;

export function isCustomerClaimableStatus(status?: string | null) {
  return (CUSTOMER_CLAIMABLE_STATUSES as readonly string[]).includes(status ?? "");
}
