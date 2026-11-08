import { LOCALE_COOKIE, isStoreLocale, type StoreLocale } from "@volt/shared";
import { dictionaries, type MessageKey } from "./messages";

export type { MessageKey, StoreLocale };

export function i18nBuildEnabled() {
  return process.env.NEXT_PUBLIC_I18N_ENABLED === "true";
}

export function translate(
  locale: StoreLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
) {
  const table = dictionaries[locale] ?? dictionaries.en;
  let text = table[key] || dictionaries.en[key] || key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function localeFromCookieHeader(header: string | null | undefined): StoreLocale {
  if (!header) return "en";
  const match = header.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  const raw = match?.[1] ? decodeURIComponent(match[1]) : "";
  return isStoreLocale(raw) ? raw : "en";
}

export function writeLocaleCookie(locale: StoreLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function statusKey(status: string): MessageKey {
  const key = `status.${status}` as MessageKey;
  return key in dictionaries.en ? key : "status.PENDING_PAYMENT";
}

export function reasonKey(code: string): MessageKey {
  const key = `reason.${code}` as MessageKey;
  return key in dictionaries.en ? key : "reason.other";
}

export function shippingKey(code: string): MessageKey {
  const key = `shipping.${code}` as MessageKey;
  return key in dictionaries.en ? key : "shipping.standard";
}

export function fulfillmentStatusKey(status: string, shippingMethod?: string): MessageKey {
  if (shippingMethod === "pickup") {
    if (status === "SHIPPING") return "status.pickupReady";
    if (status === "DELIVERED") return "status.collected";
  }
  return statusKey(status);
}
