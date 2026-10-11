import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth.js";
import { ALL_ROLES, STAFF_ROLES } from "./roles.js";
import { ORDER_STATUSES } from "./checkout.js";
import { barcodeSchema, locatorPartSchema, normalizeBarcode } from "./product.js";
import { FINLAND_VAT_RATE, SALES_GROUPS, SALES_RANGES } from "./pricing.js";
import { SHIPPING_CARRIERS } from "./shipping.js";

const dimension = z.coerce.number().positive("Must be a positive number");

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const adminProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(8000),
  price: z.coerce.number().positive("Retail price must be greater than 0"),
  wholesalePrice: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce.number().min(0).nullable(),
  ),
  vatRate: z.coerce.number().min(0).max(100).optional().default(FINLAND_VAT_RATE),
  stockQuantity: z.coerce.number().int().min(0),
  category: z.string().trim().min(1).max(80),
  brand: z.string().trim().min(1).max(80),
  featured: z.boolean().optional(),
  weightKg: dimension,
  lengthCm: dimension,
  widthCm: dimension,
  heightCm: dimension,
  weightLb: dimension.optional(),
  lengthIn: dimension.optional(),
  widthIn: dimension.optional(),
  heightIn: dimension.optional(),
  locatorStation: locatorPartSchema.optional().default(1),
  locatorBlock: locatorPartSchema.optional().default(1),
  locatorShelf: locatorPartSchema.optional().default(1),
  locatorPlace: locatorPartSchema.optional().default(1),
  wholesalerId: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.string().uuid().nullable(),
  ),
  wholesaleSku: z.preprocess(
    (value) => (value === "" || value == null ? null : String(value).trim()),
    z.string().max(80).nullable(),
  ),
  barcode: barcodeSchema,
  attributes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(80),
      }),
    )
    .optional(),
});

export const adminCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional().or(z.literal("")),
});

export const adminUserRoleSchema = z.object({
  role: z.enum(ALL_ROLES),
});

export const adminCreateEmployeeSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  role: z.enum(STAFF_ROLES),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

export const adminOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(240).optional().or(z.literal("")),
  carrier: z.enum(SHIPPING_CARRIERS).optional(),
  trackingCode: z.string().trim().max(120).optional().or(z.literal("")),
  estimatedDeliveryFrom: isoDate,
  estimatedDeliveryTo: isoDate,
});

export const pickOrderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        quantity: z.coerce.number().int().min(1),
      }),
    )
    .min(1),
});

export const adminShippingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  price: z.coerce.number().min(0),
  freeThreshold: z.coerce.number().min(0).nullable().optional(),
  minDays: z.coerce.number().int().min(0).max(60),
  maxDays: z.coerce.number().int().min(0).max(60),
  active: z.boolean().optional(),
});

export const USER_ROLE_FILTERS = ["staff", ...ALL_ROLES] as const;

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(USER_ROLE_FILTERS).optional(),
  ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminWholesalerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
});

export const receiveStockSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(1, "Scan or type a barcode")
    .transform(normalizeBarcode)
    .pipe(z.string().regex(/^[A-Z0-9]{8,32}$/, "Use 8–32 letters or digits")),
  quantity: z.coerce.number().int().min(1).max(9999).optional().default(1),
});

export const restockOrderSchema = z.object({
  note: z.string().trim().max(800).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(9999),
      }),
    )
    .min(1, "Add at least one product to the restock order"),
});

export const LOW_STOCK_THRESHOLD = 8;

export function suggestedRestockQty(stockQuantity: number) {
  if (stockQuantity >= LOW_STOCK_THRESHOLD) return 0;
  return Math.max(6, 20 - stockQuantity);
}

export const AUDIT_ENTITIES = [
  "product",
  "category",
  "order",
  "review",
  "shipping",
  "wholesaler",
  "purchase_order",
  "user",
] as const;

export const adminSalesQuerySchema = z.object({
  range: z.enum(SALES_RANGES).optional().default("last_30_days"),
  group: z.enum(SALES_GROUPS).optional(),
  productId: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().uuid().optional(),
  ),
  category: z.preprocess(
    (value) => (value === "" || value == null ? undefined : String(value).trim()),
    z.string().max(80).optional(),
  ),
});

export const adminAuditQuerySchema = z.object({
  entity: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(AUDIT_ENTITIES).optional(),
  ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});

export type AdminProductInput = z.infer<typeof adminProductSchema>;
export type AdminCategoryInput = z.infer<typeof adminCategorySchema>;
export type AdminWholesalerInput = z.infer<typeof adminWholesalerSchema>;
export type AdminCreateEmployeeInput = z.infer<typeof adminCreateEmployeeSchema>;
export type PickOrderInput = z.infer<typeof pickOrderSchema>;
export type RestockOrderInput = z.infer<typeof restockOrderSchema>;
