import { cookies } from "next/headers";
import { LOCALE_COOKIE, isStoreLocale, type StoreLocale } from "@volt/shared";
import { i18nBuildEnabled, translate, type MessageKey } from "./index";

export async function getRequestLocale(): Promise<StoreLocale> {
  if (!i18nBuildEnabled()) return "en";
  const jar = await cookies();
  const raw = jar.get(LOCALE_COOKIE)?.value;
  return isStoreLocale(raw) ? raw : "en";
}

export async function getTranslator() {
  const locale = await getRequestLocale();
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
