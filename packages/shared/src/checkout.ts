import { z } from "zod";
import { emailSchema } from "./auth.js";

export const CHECKOUT_COUNTRIES = [
  { code: "FI", name: "Finland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
] as const;

export type CountryCode = (typeof CHECKOUT_COUNTRIES)[number]["code"];

const countryCodes = CHECKOUT_COUNTRIES.map((country) => country.code) as [
  CountryCode,
  ...CountryCode[],
];

const postalRules: Record<string, { pattern: RegExp; message: string }> = {
  FI: { pattern: /^\d{5}$/, message: "Finnish postcodes are 5 digits (e.g. 00100)" },
  SE: { pattern: /^\d{3}\s?\d{2}$/, message: "Swedish postcodes look like 111 22" },
  NO: { pattern: /^\d{4}$/, message: "Norwegian postcodes are 4 digits" },
  DK: { pattern: /^\d{4}$/, message: "Danish postcodes are 4 digits" },
  EE: { pattern: /^\d{5}$/, message: "Estonian postcodes are 5 digits" },
  DE: { pattern: /^\d{5}$/, message: "German postcodes are 5 digits" },
  FR: { pattern: /^\d{5}$/, message: "French postcodes are 5 digits" },
  NL: { pattern: /^\d{4}\s?[A-Z]{2}$/i, message: "Dutch postcodes look like 1012 AB" },
  GB: {
    pattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    message: "Enter a valid UK postcode (e.g. SW1A 1AA)",
  },
  IE: { pattern: /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i, message: "Enter a valid Eircode" },
  US: { pattern: /^\d{5}(-\d{4})?$/, message: "Use a 5-digit US ZIP code" },
  CA: { pattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, message: "Canadian postcodes look like K1A 0B1" },
  AU: { pattern: /^\d{4}$/, message: "Australian postcodes are 4 digits" },
  ES: { pattern: /^\d{5}$/, message: "Spanish postcodes are 5 digits" },
  IT: { pattern: /^\d{5}$/, message: "Italian postcodes are 5 digits" },
};

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .regex(/^\+?[0-9][0-9\s\-()]{6,18}$/, "Enter a valid phone number");

export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || phoneSchema.safeParse(value).success, {
    message: "Enter a valid phone number",
  })
  .optional();

export const shippingMethodSchema = z.enum(["standard", "express"]);

export const addressSchema = z
  .object({
    recipientName: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
    line1: z.string().trim().min(3, "Street address is required").max(120, "Address is too long"),
    line2: z.string().trim().max(120, "Address is too long").optional().or(z.literal("")),
    city: z.string().trim().min(1, "City is required").max(80, "City is too long"),
    region: z.string().trim().max(80, "Region is too long").optional().or(z.literal("")),
    postal: z.string().trim().min(2, "Postal code is required").max(16, "Postal code is too long"),
    country: z.enum(countryCodes, { errorMap: () => ({ message: "Choose a country" }) }),
    phone: optionalPhoneSchema,
    label: z.string().trim().max(40).optional().or(z.literal("")),
    isDefault: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const rule = postalRules[value.country];
    const postal = value.postal.trim();
    if (rule && !rule.pattern.test(postal)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: rule.message, path: ["postal"] });
    }
  });

export const savedAddressSchema = addressSchema;

export const checkoutQuoteSchema = z.object({
  email: emailSchema.optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  phone: optionalPhoneSchema,
  shippingMethod: shippingMethodSchema.default("standard"),
  addressId: z.string().uuid().optional(),
  address: addressSchema.optional(),
  saveAddress: z.boolean().optional(),
  billingSameAsShipping: z.boolean().optional(),
  billingAddress: addressSchema.optional(),
});

export const checkoutValidateSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
    phone: phoneSchema,
    shippingMethod: shippingMethodSchema,
    addressId: z.string().uuid().optional(),
    address: addressSchema.optional(),
    saveAddress: z.boolean().optional(),
    billingSameAsShipping: z.boolean().optional().default(true),
    billingAddress: addressSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.addressId && !value.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shipping address is required",
        path: ["address"],
      });
    }
    if (value.billingSameAsShipping === false && !value.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Billing address is required when it differs from shipping",
        path: ["billingAddress"],
      });
    }
  });

export const checkoutPlaceSchema = checkoutValidateSchema;

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "PAID",
  "PROCESSING",
  "SHIPPING",
  "WITH_COURIER",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export const STAFF_REFUNDABLE_STATUSES = [
  "PAID",
  "PROCESSING",
  "SHIPPING",
  "WITH_COURIER",
  "DELIVERED",
] as const;

export const ORDER_STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  PENDING_PAYMENT: "Pending payment",
  PAYMENT_FAILED: "Payment failed",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPING: "Shipping",
  WITH_COURIER: "With the courier",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function formatOrderStatus(status: string) {
  return ORDER_STATUS_LABELS[status as (typeof ORDER_STATUSES)[number]] ?? status.replaceAll("_", " ");
}

/** Staff and customer order number: VC- plus the first 8 hex chars of the UUID, uppercased. */
export function formatOrderReference(orderId: string) {
  return `VC-${orderId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export const CUSTOMER_REFUND_REASONS = [
  { code: "changed_mind", label: "Changed my mind" },
  { code: "ordered_by_mistake", label: "Ordered by mistake" },
  { code: "wrong_or_damaged", label: "Wrong or damaged item" },
  { code: "never_arrived", label: "Never arrived / too late" },
  { code: "other", label: "Other" },
] as const;

export const STAFF_ONLY_REFUND_REASONS = [
  { code: "customer_requested", label: "Customer requested" },
  { code: "shop_error", label: "Shop error" },
] as const;

export const STAFF_REFUND_REASONS = [...CUSTOMER_REFUND_REASONS, ...STAFF_ONLY_REFUND_REASONS] as const;

const customerRefundReasonCodes = CUSTOMER_REFUND_REASONS.map((row) => row.code) as [
  (typeof CUSTOMER_REFUND_REASONS)[number]["code"],
  ...(typeof CUSTOMER_REFUND_REASONS)[number]["code"][],
];
const staffRefundReasonCodes = STAFF_REFUND_REASONS.map((row) => row.code) as [
  (typeof STAFF_REFUND_REASONS)[number]["code"],
  ...(typeof STAFF_REFUND_REASONS)[number]["code"][],
];

function refundRequestSchema(reasonCodes: [string, ...string[]]) {
  return z
    .object({
      reason: z.enum(reasonCodes, { errorMap: () => ({ message: "Choose a refund reason" }) }),
      note: z.string().trim().max(240, "Keep the note under 240 characters").optional().or(z.literal("")),
    })
    .superRefine((value, ctx) => {
      if (value.reason === "other" && !value.note?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a short note for Other",
          path: ["note"],
        });
      }
    });
}

export const customerRefundRequestSchema = refundRequestSchema(customerRefundReasonCodes);
export const staffRefundRequestSchema = refundRequestSchema(staffRefundReasonCodes);

export function refundReasonLabel(code: string) {
  return STAFF_REFUND_REASONS.find((row) => row.code === code)?.label ?? code;
}

export function stripeRefundReason(code: string): "duplicate" | "requested_by_customer" {
  return code === "ordered_by_mistake" ? "duplicate" : "requested_by_customer";
}

export function formatRefundNote(reason: string, note: string | undefined, actor: "customer" | "staff") {
  const label = refundReasonLabel(reason);
  const extra = note?.trim() ? ` — ${note.trim()}` : "";
  return `${actor === "staff" ? "Staff" : "Customer"} refund: ${label}${extra}`;
}

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const PAYMENT_STATUS_QUEUE = "payment.status";
export const PAYMENT_STATUS_DLQ = "payment.status.dlq";

export type PaymentStatusOutcome = "succeeded" | "failed" | "canceled" | "processing";

export type PaymentStatusMessage = {
  v: 1;
  orderId: string;
  paymentIntentId?: string;
  outcome: PaymentStatusOutcome;
  reason?: string;
};

export const STRIPE_TEST_CARDS = [
  { label: "Success", number: "4242 4242 4242 4242", note: "Any future expiry, any CVC" },
  { label: "Insufficient funds", number: "4000 0000 0000 9995", note: "Declines after submit" },
  { label: "Expired card", number: "4000 0000 0000 0069", note: "Expired card decline" },
  { label: "Generic decline", number: "4000 0000 0000 0002", note: "Invalid / declined card" },
] as const;

export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type CheckoutValidateInput = z.infer<typeof checkoutValidateSchema>;
export type CheckoutPlaceInput = z.infer<typeof checkoutPlaceSchema>;
export type ShippingMethod = z.infer<typeof shippingMethodSchema>;
export type OrderStatusFilter = (typeof ORDER_STATUSES)[number];
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type CustomerRefundRequest = z.infer<typeof customerRefundRequestSchema>;
export type StaffRefundRequest = z.infer<typeof staffRefundRequestSchema>;
export type RefundReasonCode = (typeof STAFF_REFUND_REASONS)[number]["code"];
