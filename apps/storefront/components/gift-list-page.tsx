"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, userErrorMessage } from "@/lib/api";
import type { Product } from "@/lib/product";
import { AddToCartButton } from "./cart";
import { useI18n } from "./i18n";
import { ProductPrice } from "./product-price";
import type { MessageKey } from "@/lib/i18n";

type PublicGiftList = {
  title: string;
  occasion: string;
  ownerName: string;
  items: { productId: string; reserved: boolean; product: Product }[];
};

function claimsKey(token: string) {
  return `volt.gift.${token}`;
}

function readClaims(token: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(claimsKey(token)) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeClaims(token: string, claims: Record<string, string>) {
  localStorage.setItem(claimsKey(token), JSON.stringify(claims));
}

function occasionKey(occasion: string): MessageKey {
  const key = `gift.occasion.${occasion}` as MessageKey;
  return key === "gift.occasion.christmas" || key === "gift.occasion.birthday" || key === "gift.occasion.other"
    ? key
    : "gift.occasion.other";
}

export function GiftListPage({ token }: { token: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<PublicGiftList | null>(null);
  const [missing, setMissing] = useState(false);
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api<PublicGiftList>(`/gift-lists/shared/${token}`);
      setList(data);
      setMissing(false);
    } catch {
      setList(null);
      setMissing(true);
    }
  }

  useEffect(() => {
    setClaims(readClaims(token));
    void load();
  }, [token]);

  async function reserve(productId: string) {
    setBusyId(productId);
    setError("");
    try {
      const result = await api<{ claimToken: string }>(
        `/gift-lists/shared/${token}/items/${productId}/reserve`,
        { method: "POST", body: JSON.stringify({ claimToken: claims[productId] }) },
      );
      const next = { ...claims, [productId]: result.claimToken };
      writeClaims(token, next);
      setClaims(next);
      await load();
    } catch (err) {
      setError(userErrorMessage(err));
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function release(productId: string) {
    const claimToken = claims[productId];
    if (!claimToken) return;
    setBusyId(productId);
    setError("");
    try {
      await api(`/gift-lists/shared/${token}/items/${productId}/release`, {
        method: "POST",
        body: JSON.stringify({ claimToken }),
      });
      const next = { ...claims };
      delete next[productId];
      writeClaims(token, next);
      setClaims(next);
      await load();
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  if (missing) {
    return (
      <section>
        <h1>{t("gift.title")}</h1>
        <p>{t("gift.missing")}</p>
        <p>
          <Link href="/catalog">{t("nav.catalog")}</Link>
        </p>
      </section>
    );
  }

  if (!list) return <p>{t("account.loading")}</p>;

  return (
    <section>
      <p className="kicker">{t("gift.title")}</p>
      <h1>{list.title}</h1>
      <p>
        {t("gift.lead", {
          owner: list.ownerName,
          occasion: t(occasionKey(list.occasion)),
        })}
      </p>
      {error ? <p className="banner error">{error}</p> : null}
      {list.items.length === 0 ? (
        <p>{t("gift.empty")}</p>
      ) : (
        <ul className="gift-items">
          {list.items.map((item) => {
            const mine = Boolean(claims[item.productId]);
            const reserved = item.reserved;
            const image = item.product.images[0];
            return (
              <li key={item.productId} className={reserved ? "gift-item reserved" : "gift-item"}>
                <Link className="gift-item-media" href={`/products/${item.product.slug}`}>
                  {image?.thumbUrl || image?.url ? (
                    <img
                      src={image.thumbUrl || image.url}
                      alt={image.altText || item.product.name}
                    />
                  ) : (
                    <span className="photo-fallback">{item.product.name}</span>
                  )}
                </Link>
                <div className="gift-item-body">
                  <p className="muted">{item.product.brand.name}</p>
                  <h2>
                    <Link href={`/products/${item.product.slug}`}>{item.product.name}</Link>
                  </h2>
                  <ProductPrice product={item.product} showNote={false} />
                </div>
                <div className="gift-item-actions">
                  {reserved && !mine ? (
                    <p className="gift-badge">{t("gift.reserved")}</p>
                  ) : mine ? (
                    <>
                      <p className="gift-badge yours">{t("gift.yours")}</p>
                      <button
                        className="ghost"
                        type="button"
                        disabled={busyId === item.productId}
                        onClick={() => void release(item.productId)}
                      >
                        {busyId === item.productId ? t("gift.busy") : t("gift.release")}
                      </button>
                    </>
                  ) : (
                    <>
                      <AddToCartButton
                        productId={item.product.id}
                        stockQuantity={item.product.stockQuantity}
                        compact
                      />
                      <button
                        className="primary"
                        type="button"
                        disabled={busyId === item.productId}
                        onClick={() => void reserve(item.productId)}
                      >
                        {busyId === item.productId ? t("gift.busy") : t("gift.reserve")}
                      </button>
                      <p className="muted gift-hint">{t("gift.reserveHint")}</p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
