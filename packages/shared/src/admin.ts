import { z } from "zod";
import { ALL_ROLES } from "./roles.js";
import { ORDER_STATUSES } from "./checkout.js";
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
  price: z.coerce.number().positive("Price must be greater than 0"),
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

export const adminShippingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  price: z.coerce.number().min(0),
  freeThreshold: z.coerce.number().min(0).nullable().optional(),
  minDays: z.coerce.number().int().min(0).max(60),
  maxDays: z.coerce.number().int().min(0).max(60),
  active: z.boolean().optional(),
});

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(ALL_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const AUDIT_ENTITIES = ["product", "category", "order", "review", "shipping"] as const;

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
