"use client";

import { useState, type FormEvent } from "react";
import { LOW_STOCK_THRESHOLD } from "@volt/shared";
import { api, userErrorMessage } from "@/lib/api";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import { useShopLists } from "./shop-lists";
import type { Product } from "@/lib/product";

export function ProductStockLine({ stockQuantity }: { stockQuantity: number }) {
  const { t } = useI18n();
  if (stockQuantity <= 0) return <p className="muted">{t("stock.outOfStock")}</p>;
  return (
    <p className={stockQuantity < LOW_STOCK_THRESHOLD ? "stock-warn" : "muted"}>
      {stockQuantity < LOW_STOCK_THRESHOLD
        ? t("stock.onlyLeft", { n: stockQuantity })
        : t("stock.inStock", { n: stockQuantity })}
    </p>
  );
}

export function ProductDeliveryEstimate() {
  const { t } = useI18n();
  return (
    <p className="muted">
      {t("stock.delivery")}: {t("stock.etaStandard")} · {t("stock.etaExpress")} · {t("stock.etaPickup")}
    </p>
  );
}

export function ProductSaveActions({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { t } = useI18n();
  const { wishlistIds, compareIds, toggleWishlist, toggleCompare } = useShopLists();
  const [compareLimit, setCompareLimit] = useState(false);
  const saved = wishlistIds.includes(product.id);
  const compared = compareIds.includes(product.id);

  return (
    <div className={compact ? "save-actions compact" : "save-actions"}>
      <button
        className="ghost"
        type="button"
        onClick={() => void toggleWishlist(product.id)}
        aria-pressed={saved}
      >
        {saved ? t("wishlist.added") : t("wishlist.add")}
      </button>
      <button
        className="ghost"
        type="button"
        aria-pressed={compared}
        onClick={() => {
          const result = toggleCompare(product.id);
          setCompareLimit(Boolean(result.limit));
        }}
      >
        {compared ? t("compare.added") : t("compare.add")}
      </button>
      {compareLimit && <p className="muted">{t("compare.limit", { n: 3 })}</p>}
    </div>
  );
}

export function BackInStockForm({ productId }: { productId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/stock-alerts", { method: "POST", body: JSON.stringify({ productId, email }) });
      setDone(true);
    } catch (err) {
      setError(userErrorMessage(err, "Could not save the alert."));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="banner ok">{t("stock.notifyDone")}</p>;

  return (
    <form className="stock-alert" onSubmit={(event) => void submit(event)}>
      <p>{t("stock.notifyTitle")}</p>
      <label className="field">
        <span>{t("stock.notifyEmail")}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="ghost" type="submit" disabled={busy}>
        {busy ? t("stock.notifyBusy") : t("stock.notifySubmit")}
      </button>
    </form>
  );
}
