"use client";

import { useEffect, useState, type FormEvent } from "react";
import { GIFT_OCCASIONS, type GiftOccasion } from "@volt/shared";
import { api, userErrorMessage } from "@/lib/api";
import type { Product } from "@/lib/product";
import { useI18n } from "./i18n";
import type { MessageKey } from "@/lib/i18n";

export type GiftListSummary = {
  id: string;
  title: string;
  occasion: string;
  shareToken: string;
  shareUrl: string;
  items: { productId: string; reserved: boolean; product: Product }[];
};

function occasionKey(occasion: string): MessageKey {
  const key = `gift.occasion.${occasion}` as MessageKey;
  return key === "gift.occasion.christmas" || key === "gift.occasion.birthday" || key === "gift.occasion.other"
    ? key
    : "gift.occasion.other";
}

function defaultTitle(occasion: GiftOccasion, t: (key: MessageKey) => string) {
  if (occasion === "christmas") return t("gift.occasion.christmas");
  if (occasion === "birthday") return t("gift.occasion.birthday");
  return t("gift.title");
}

export function GiftListShare({
  token,
  hasItems,
}: {
  token: string;
  hasItems: boolean;
}) {
  const { t } = useI18n();
  const [lists, setLists] = useState<GiftListSummary[]>([]);
  const [occasion, setOccasion] = useState<GiftOccasion>("christmas");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api<{ items: GiftListSummary[] }>("/gift-lists", { token })
      .then((data) => {
        if (!cancelled) setLists(data.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!hasItems) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<GiftListSummary>("/gift-lists", {
        method: "POST",
        token,
        body: JSON.stringify({
          title: title.trim() || defaultTitle(occasion, t),
          occasion,
        }),
      });
      setLists((current) => [created, ...current]);
      setTitle("");
    } catch (err) {
      setError(userErrorMessage(err, t("wishlist.shareNeedItems")));
    } finally {
      setBusy(false);
    }
  }

  async function copy(list: GiftListSummary) {
    const href = `${window.location.origin}/lists/${list.shareToken}`;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(list.id);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setError(href);
    }
  }

  async function refresh(list: GiftListSummary) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<GiftListSummary>(`/gift-lists/${list.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ refreshFromWishlist: true }),
      });
      setLists((current) => current.map((row) => (row.id === list.id ? updated : row)));
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(list: GiftListSummary) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<GiftListSummary>(`/gift-lists/${list.id}/rotate`, {
        method: "POST",
        token,
      });
      setLists((current) => current.map((row) => (row.id === list.id ? updated : row)));
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop(list: GiftListSummary) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ items: GiftListSummary[] }>(`/gift-lists/${list.id}`, {
        method: "DELETE",
        token,
      });
      setLists(data.items);
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unreserve(list: GiftListSummary, productId: string) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<GiftListSummary>(`/gift-lists/${list.id}/items/${productId}/release`, {
        method: "POST",
        token,
      });
      setLists((current) => current.map((row) => (row.id === list.id ? updated : row)));
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gift-share panel">
      <h2>{t("wishlist.shareTitle")}</h2>
      <p className="muted">{t("wishlist.shareLead")}</p>
      {error ? <p className="banner error">{error}</p> : null}
      <form className="gift-share-form" onSubmit={(event) => void create(event)}>
        <label className="field">
          <span>{t("wishlist.shareOccasion")}</span>
          <select
            value={occasion}
            onChange={(event) => setOccasion(event.target.value as GiftOccasion)}
          >
            {GIFT_OCCASIONS.map((value) => (
              <option key={value} value={value}>
                {t(occasionKey(value))}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("wishlist.shareName")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultTitle(occasion, t)}
            maxLength={80}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || !hasItems}>
          {busy ? t("wishlist.shareBusy") : t("wishlist.shareCreate")}
        </button>
      </form>
      {!hasItems ? <p className="muted">{t("wishlist.shareNeedItems")}</p> : null}

      {lists.length > 0 ? (
        <div className="gift-share-lists">
          <h3>{t("wishlist.shareLists")}</h3>
          {lists.map((list) => (
            <article key={list.id} className="gift-share-card">
              <p>
                <strong>{list.title}</strong>
                <span className="muted"> · {t(occasionKey(list.occasion))}</span>
              </p>
              <p className="gift-share-url muted">{`${typeof window !== "undefined" ? window.location.origin : ""}/lists/${list.shareToken}`}</p>
              <div className="actions">
                <button className="primary" type="button" onClick={() => void copy(list)}>
                  {copied === list.id ? t("wishlist.shareCopied") : t("wishlist.shareCopy")}
                </button>
                <button className="ghost" type="button" disabled={busy} onClick={() => void refresh(list)}>
                  {t("wishlist.shareRefresh")}
                </button>
                <button className="ghost" type="button" disabled={busy} onClick={() => void rotate(list)}>
                  {t("wishlist.shareRotate")}
                </button>
                <button className="ghost" type="button" disabled={busy} onClick={() => void stop(list)}>
                  {t("wishlist.shareStop")}
                </button>
              </div>
              {list.items.some((item) => item.reserved) ? (
                <ul className="gift-share-reserved">
                  {list.items
                    .filter((item) => item.reserved)
                    .map((item) => (
                      <li key={item.productId}>
                        <span>
                          {item.product.name} — {t("wishlist.shareReserved")}
                        </span>
                        <button
                          className="ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void unreserve(list, item.productId)}
                        >
                          {t("wishlist.shareAvailable")}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
