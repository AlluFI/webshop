"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isStaffRole } from "@volt/shared";
import { api } from "@/lib/api";
import { AccountNav } from "./account-nav";
import { ProductCard } from "./product-card";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import { GiftListShare } from "./gift-list-share";
import { useShopLists } from "./shop-lists";
import type { Product } from "@/lib/product";

export function WishlistPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { accessToken, user, ready: authReady } = useAuth();
  const { wishlistIds, ready } = useShopLists();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const staff = Boolean(user && isStaffRole(user.role));

  useEffect(() => {
    if (authReady && !user) router.replace("/login");
  }, [authReady, user, router]);

  useEffect(() => {
    if (!ready || !user) return;
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

  if (!authReady || !user) return <p>{t("account.loading")}</p>;

  return (
    <section>
      <AccountNav />
      <h1>{t("wishlist.title")}</h1>
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
      {!staff && accessToken ? <GiftListShare token={accessToken} hasItems={!loading && items.length > 0} /> : null}
    </section>
  );
}
