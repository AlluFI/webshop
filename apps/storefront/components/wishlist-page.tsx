"use client";

import { useEffect, useState } from "react";
import { isStaffRole } from "@volt/shared";
import { api } from "@/lib/api";
import { ProductCard } from "./product-card";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import { useShopLists } from "./shop-lists";
import type { Product } from "@/lib/product";

export function WishlistPage() {
  const { t } = useI18n();
  const { accessToken, user } = useAuth();
  const { wishlistIds, ready } = useShopLists();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const staff = Boolean(user && isStaffRole(user.role));

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (accessToken && user && !staff) {
          const data = await api<{ items: Product[] }>("/wishlist", { token: accessToken });
          if (!cancelled) setItems(data.items);
          return;
        }
        const loaded: Product[] = [];
        for (const id of wishlistIds) {
          try {
            loaded.push(await api<Product>(`/products/${id}`));
          } catch {
            // removed product
          }
        }
        if (!cancelled) setItems(loaded);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, ready, staff, user, wishlistIds]);

  return (
    <section>
      <h1>{t("wishlist.title")}</h1>
      {!user && <p className="muted">{t("wishlist.signIn")}</p>}
      {!user && <p className="muted">{t("wishlist.guestHint")}</p>}
      {staff && <p className="muted">{t("wishlist.staffHint")}</p>}
      {loading ? (
        <p>…</p>
      ) : items.length === 0 ? (
        <p>{t("wishlist.empty")}</p>
      ) : (
        <div className="grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
