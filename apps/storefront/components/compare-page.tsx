"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { money } from "@/lib/product";
import { ProductPrice } from "./product-price";
import { useI18n } from "./i18n";
import { useShopLists } from "./shop-lists";
import type { Product } from "@/lib/product";

export function ComparePage() {
  const { t } = useI18n();
  const { compareIds, toggleCompare, clearCompare } = useShopLists();
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loaded: Product[] = [];
      for (const id of compareIds) {
        try {
          loaded.push(await api<Product>(`/products/${id}`));
        } catch {
          // skip
        }
      }
      if (!cancelled) setItems(loaded);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [compareIds]);

  if (items.length < 2) {
    return (
      <section>
        <h1>{t("compare.title")}</h1>
        <p>{t("compare.empty")}</p>
      </section>
    );
  }

  return (
    <section>
      <h1>{t("compare.title")}</h1>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              {items.map((product) => (
                <th key={product.id}>
                  <Link href={`/products/${product.slug}`}>{product.name}</Link>
                  <button className="link" type="button" onClick={() => toggleCompare(product.id)}>
                    {t("compare.remove")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{t("compare.price")}</th>
              {items.map((product) => (
                <td key={product.id}>
                  <ProductPrice product={product} />
                </td>
              ))}
            </tr>
            <tr>
              <th>{t("compare.stock")}</th>
              {items.map((product) => (
                <td key={product.id}>{product.stockQuantity}</td>
              ))}
            </tr>
            <tr>
              <th>{t("compare.rating")}</th>
              {items.map((product) => (
                <td key={product.id}>
                  {product.averageRating.toFixed(1)} ({product.reviewCount})
                </td>
              ))}
            </tr>
            <tr>
              <th>{t("compare.brand")}</th>
              {items.map((product) => (
                <td key={product.id}>{product.brand.name}</td>
              ))}
            </tr>
            <tr>
              <th>{t("compare.category")}</th>
              {items.map((product) => (
                <td key={product.id}>{product.category.name}</td>
              ))}
            </tr>
            <tr>
              <th>{t("compare.weight")}</th>
              {items.map((product) => (
                <td key={product.id}>
                  {product.weightKg} kg / {product.weightLb} lb
                </td>
              ))}
            </tr>
            <tr>
              <th />
              {items.map((product) => (
                <td key={product.id}>
                  <Link href={`/products/${product.slug}`}>{money(product.sellingPrice ?? product.price)}</Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="compare-clear">
        <button className="ghost" type="button" onClick={clearCompare}>
          {t("compare.clear")}
        </button>
      </p>
    </section>
  );
}
