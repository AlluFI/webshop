import { z } from "zod";
import { emailSchema } from "./auth.js";

export const STORE_LOCALES = ["en", "fi", "sv"] as const;
export type StoreLocale = (typeof STORE_LOCALES)[number];

export const STORE_LOCALE_LABELS: Record<StoreLocale, string> = {
  en: "English",
  fi: "Suomi",
  sv: "Svenska",
};

export const LOCALE_COOKIE = "volt_locale";
export const COOKIE_CONSENT_COOKIE = "volt_cookie_consent";
export const COMPARE_LIMIT = 3;

export function isStoreLocale(value: unknown): value is StoreLocale {
  return typeof value === "string" && (STORE_LOCALES as readonly string[]).includes(value);
}

export const wishlistItemSchema = z.object({
  productId: z.string().uuid("Choose a product"),
});

export const stockAlertSchema = z.object({
  productId: z.string().uuid("Choose a product"),
  email: emailSchema,
});

export const guestOrderLookupSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(4, "Enter the order number from your email")
    .max(20, "That order number is too long"),
  lastName: z.string().trim().min(2, "Enter the last name on the order").max(80, "Name is too long"),
});

export function parseOrderReference(value: string) {
  const match = value.trim().toUpperCase().match(/^(?:VC-)?([0-9A-F]{8})$/);
  return match ? match[1].toLowerCase() : null;
}

export function lastNameOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || "").toLocaleLowerCase("fi-FI");
}

export function lastNamesMatch(fullName: string, lastName: string) {
  const given = lastName.trim().toLocaleLowerCase("fi-FI");
  if (!given) return false;
  const full = fullName.trim().toLocaleLowerCase("fi-FI");
  return lastNameOf(fullName) === given || full === given;
}

export function formatShippingMethod(code: string) {
  if (code === "pickup") return "Pickup";
  if (code === "express") return "Express";
  if (code === "standard") return "Standard";
  return code;
}
