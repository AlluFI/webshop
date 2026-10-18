import { STORE_CURRENCY } from "@volt/shared";

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  wholesalePrice?: number | null;
  vatRate?: number;
  pricing?: {
    retail: number;
    wholesale: number | null;
    vatRate: number;
    net: number;
    vat: number;
    margin: number | null;
    marginPct: number | null;
  };
  stockQuantity: number;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  images: { url: string; thumbUrl?: string; altText: string }[];
  featured?: boolean;
  barcode?: string | null;
  locator?: {
    station: number;
    block: number;
    shelf: number;
    place: number;
    code: string;
  };
  wholesaler?: {
    id: string;
    name: string;
    email: string;
    sku: string | null;
  } | null;
  weightKg: number;
  weightLb: number;
  dimensions: {
    metric: { lengthCm: number; widthCm: number; heightCm: number };
    imperial: { lengthIn: number; widthIn: number; heightIn: number };
  };
  averageRating: number;
  reviewCount: number;
  modelCode?: string | null;
  colorName?: string | null;
  warrantyMonths?: number | null;
  warrantyNote?: string | null;
  manufacturerUrl?: string | null;
  brandUrl?: string | null;
  packageContents?: string | null;
  highlights?: string | null;
  releaseYear?: number | null;
  energyClass?: string | null;
  attributes: { name: string; value: string }[];
  related?: Product[];
};

export type Facet = { slug: string; name: string; count: number };

export type CatalogResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    brands: Facet[];
    categories: Facet[];
    price: { min: number; max: number };
  };
};

export type Category = {
  name: string;
  slug: string;
  description?: string | null;
  _count?: { products: number };
};

export function money(value: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: STORE_CURRENCY }).format(value);
}

export function stars(value: number) {
  const rounded = Math.round(value);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

export function queryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}
