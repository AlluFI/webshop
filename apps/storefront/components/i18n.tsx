"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { STORE_LOCALES, STORE_LOCALE_LABELS, type StoreLocale } from "@volt/shared";
import { api } from "@/lib/api";
import { i18nBuildEnabled, translate, writeLocaleCookie, type MessageKey } from "@/lib/i18n";

type I18nContextValue = {
  locale: StoreLocale;
  enabled: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: StoreLocale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: StoreLocale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<StoreLocale>(initialLocale);
  const [enabled, setEnabled] = useState(i18nBuildEnabled());

  useEffect(() => {
    void api<{ i18nEnabled: boolean }>("/shop/config")
      .then((config) => setEnabled(config.i18nEnabled || i18nBuildEnabled()))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = enabled ? locale : "en";
  }, [enabled, locale]);

  const setLocale = useCallback(
    (next: StoreLocale) => {
      writeLocaleCookie(next);
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(enabled ? locale : "en", key, vars),
    [enabled, locale],
  );

  const value = useMemo(
    () => ({ locale: enabled ? locale : "en", enabled, t, setLocale }),
    [locale, enabled, t, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}

export function LanguageSwitcher() {
  const { locale, enabled, setLocale, t } = useI18n();
  if (!enabled) return null;
  return (
    <label className="lang-switch">
      <span className="skip">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as StoreLocale)}
      >
        {STORE_LOCALES.map((code) => (
          <option key={code} value={code}>
            {STORE_LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
