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
import { COMPARE_LIMIT, isStaffRole } from "@volt/shared";
import { api } from "@/lib/api";
import { useAuth } from "./auth";
import type { Product } from "@/lib/product";

const WISHLIST_KEY = "volt.wishlist";
const COMPARE_KEY = "volt.compare";

function readIds(key: string) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
}

type ShopListsValue = {
  wishlistIds: string[];
  compareIds: string[];
  ready: boolean;
  toggleWishlist: (productId: string) => Promise<void>;
  toggleCompare: (productId: string) => { ok: boolean; limit?: boolean };
  clearCompare: () => void;
};

const ShopListsContext = createContext<ShopListsValue | null>(null);

export function ShopListsProvider({ children }: { children: ReactNode }) {
  const { accessToken, user, ready: authReady } = useAuth();
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const staff = Boolean(user && isStaffRole(user.role));

  const loadServerWishlist = useCallback(async (token: string) => {
    const data = await api<{ items: Product[] }>("/wishlist", { token });
    return data.items.map((item) => item.id);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    setCompareIds(readIds(COMPARE_KEY));
    const local = readIds(WISHLIST_KEY);
    if (!accessToken || staff) {
      setWishlistIds(local);
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        for (const productId of local) {
          await api("/wishlist", { method: "POST", token: accessToken, body: JSON.stringify({ productId }) }).catch(
            () => undefined,
          );
        }
        if (local.length) writeIds(WISHLIST_KEY, []);
        const ids = await loadServerWishlist(accessToken);
        if (!cancelled) setWishlistIds(ids);
      } catch {
        if (!cancelled) setWishlistIds(local);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authReady, loadServerWishlist, staff]);

  const toggleWishlist = useCallback(
    async (productId: string) => {
      const has = wishlistIds.includes(productId);
      const next = has ? wishlistIds.filter((id) => id !== productId) : [...wishlistIds, productId];
      setWishlistIds(next);
      if (accessToken && !staff) {
        try {
          if (has) {
            await api(`/wishlist/${productId}`, { method: "DELETE", token: accessToken });
          } else {
            await api("/wishlist", { method: "POST", token: accessToken, body: JSON.stringify({ productId }) });
          }
        } catch {
          setWishlistIds(wishlistIds);
        }
        return;
      }
      writeIds(WISHLIST_KEY, next);
    },
    [accessToken, staff, wishlistIds],
  );

  const toggleCompare = useCallback(
    (productId: string) => {
      const has = compareIds.includes(productId);
      if (!has && compareIds.length >= COMPARE_LIMIT) return { ok: false as const, limit: true };
      const next = has ? compareIds.filter((id) => id !== productId) : [...compareIds, productId];
      setCompareIds(next);
      writeIds(COMPARE_KEY, next);
      return { ok: true as const };
    },
    [compareIds],
  );

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    writeIds(COMPARE_KEY, []);
  }, []);

  const value = useMemo(
    () => ({ wishlistIds, compareIds, ready, toggleWishlist, toggleCompare, clearCompare }),
    [wishlistIds, compareIds, ready, toggleWishlist, toggleCompare, clearCompare],
  );

  return <ShopListsContext.Provider value={value}>{children}</ShopListsContext.Provider>;
}

export function useShopLists() {
  const ctx = useContext(ShopListsContext);
  if (!ctx) throw new Error("useShopLists must be used within ShopListsProvider");
  return ctx;
}
