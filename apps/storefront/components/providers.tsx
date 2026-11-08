"use client";

import type { ReactNode } from "react";
import type { StoreLocale } from "@volt/shared";
import { AuthProvider } from "./auth";
import { CartProvider } from "./cart";
import { LocaleProvider } from "./i18n";
import { ShopListsProvider } from "./shop-lists";

export function Providers({ children, locale }: { children: ReactNode; locale: StoreLocale }) {
  return (
    <LocaleProvider initialLocale={locale}>
      <AuthProvider>
        <CartProvider>
          <ShopListsProvider>{children}</ShopListsProvider>
        </CartProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
