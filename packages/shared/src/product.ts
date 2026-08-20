import { z } from "zod";

const dimension = z.coerce.number().positive("Must be a positive number");

export const productDimensionsSchema = z.object({
  weightKg: dimension,
  weightLb: dimension,
  lengthCm: dimension,
  widthCm: dimension,
  heightCm: dimension,
  lengthIn: dimension,
  widthIn: dimension,
  heightIn: dimension,
});

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  price: z.coerce.number().positive("Price must be greater than 0"),
  stockQuantity: z.coerce.number().int().min(0),
  category: z.string().min(1),
  brand: z.string().min(1),
  images: z.array(z.string().min(1)).min(1, "At least one image is required"),
  weightKg: dimension,
  weightLb: dimension,
  lengthCm: dimension,
  widthCm: dimension,
  heightCm: dimension,
  lengthIn: dimension,
  widthIn: dimension,
  heightIn: dimension,
});

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(["relevance", "price_asc", "price_desc", "rating"])
    .default("relevance"),
  featured: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
});

export type ProductInput = z.infer<typeof productSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
