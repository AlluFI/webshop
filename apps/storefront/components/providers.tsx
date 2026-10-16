"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./auth";
import { CartProvider } from "./cart";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
