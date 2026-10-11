import { z } from "zod";

const dimension = z.coerce.number().positive("Must be a positive number");

/** Station and block print as 01, 02; shelf and place stay unpadded: 01|02|2|1 */
export const locatorPartSchema = z.coerce.number().int().min(1).max(99);

export function padLocatorPair(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocatorCode(
  station: number,
  block: number,
  shelf: number,
  place: number,
) {
  return `${padLocatorPair(station)}|${padLocatorPair(block)}|${shelf}|${place}`;
}

export function normalizeBarcode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export const barcodeSchema = z.preprocess(
  (value) => (value === "" || value == null ? null : normalizeBarcode(String(value))),
  z
    .string()
    .regex(/^[A-Z0-9]{8,32}$/, "Use 8–32 letters or digits (EAN-13, UPC, or warehouse code)")
    .nullable(),
);

export function ean13CheckDigit(body12: string) {
  const digits = body12.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

/** Finland GS1 prefix 640, unique per catalog index. */
export function ean13FromIndex(index: number) {
  const body = `640000${String(index + 1).padStart(6, "0")}`;
  return `${body}${ean13CheckDigit(body)}`;
}

export function locatorFromIndex(index: number) {
  return {
    locatorStation: Math.floor(index / 64) + 1,
    locatorBlock: (Math.floor(index / 16) % 4) + 1,
    locatorShelf: (Math.floor(index / 4) % 4) + 1,
    locatorPlace: (index % 4) + 1,
  };
}

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
