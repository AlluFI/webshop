"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { formatStoreDate } from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { stars } from "@/lib/product";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";

type Review = {
  id: string;
  stars: number;
  title: string | null;
  body: string;
  helpfulCount: number;
  createdAt: string;
  author: string;
  voted: boolean;
};

export function ReviewForm({
  slug,
  heading,
  token,
  onPublished,
}: {
  slug: string;
  heading?: string;
  token: string;
  onPublished?: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api<{ review: Review }>(`/products/${slug}/reviews`, {
        method: "POST",
        token,
        body: JSON.stringify({
          stars: Number(form.get("stars")),
          title: String(form.get("title") || ""),
          body: String(form.get("body") || ""),
        }),
      });
      setError("");
      onPublished?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("review.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={(event) => void onReview(event)}>
      <h3>{heading || t("review.write")}</h3>
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span>{t("review.stars")}</span>
        <select name="stars" defaultValue="5">
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("review.titleOptional")}</span>
        <input name="title" />
      </label>
      <label className="field">
        <span>{t("review.body")}</span>
        <textarea name="body" rows={4} required minLength={10} />
      </label>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? t("review.publishing") : t("review.publish")}
      </button>
    </form>
  );
}

export function ProductReviews({ slug }: { slug: string }) {
  const { t } = useI18n();
  const { user, accessToken } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);

  useEffect(() => {
    void api<{ items: Review[] }>(`/products/${slug}/reviews?sort=helpful`, { token: accessToken })
      .then((data) => setReviews(data.items))
      .catch(() => setReviews([]));
  }, [slug, accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setOrderId(null);
      setCanReview(false);
      return;
    }
    void api<{ canReview: boolean; orderId: string | null }>(`/products/${slug}/reviews/eligibility`, {
      token: accessToken,
    })
      .then((data) => {
        setCanReview(data.canReview);
        setOrderId(data.canReview ? data.orderId : null);
      })
      .catch(() => {
        setCanReview(false);
        setOrderId(null);
      });
  }, [slug, accessToken]);

  async function vote(id: string) {
    if (!accessToken) return;
    const result = await api<{ helpfulCount: number }>(`/reviews/${id}/vote`, {
      method: "POST",
      token: accessToken,
    });
    setReviews((items) =>
      items
        .map((item) => (item.id === id ? { ...item, helpfulCount: result.helpfulCount, voted: true } : item))
        .sort((a, b) => b.helpfulCount - a.helpfulCount),
    );
  }

  return (
    <section>
      <h2>{t("review.title")}</h2>
      {orderId && (
        <p>
          <Link href={`/orders/${orderId}`}>{t("review.fromOrder")}</Link>
        </p>
      )}
      {canReview && !orderId && accessToken && (
        <ReviewForm
          slug={slug}
          token={accessToken}
          onPublished={() => {
            setCanReview(false);
            void api<{ items: Review[] }>(`/products/${slug}/reviews?sort=helpful`, { token: accessToken }).then(
              (data) => setReviews(data.items),
            );
          }}
        />
      )}
      {!user && (
        <p className="muted">
          <Link href="/login">{t("nav.signIn")}</Link> {t("review.signIn")}
        </p>
      )}
      {reviews.length === 0 && <p className="muted">{t("review.empty")}</p>}
      <ul className="review-list">
        {reviews.map((review) => (
          <li key={review.id} className="panel">
            <p className="stars">{stars(review.stars)}</p>
            {review.title && <h3>{review.title}</h3>}
            <p>{review.body}</p>
            <p className="muted">
              {review.author} · {formatStoreDate(review.createdAt)} ·{" "}
              {t("review.helpfulCount", { n: review.helpfulCount })}
            </p>
            {accessToken && (
              <button className="link" type="button" disabled={review.voted} onClick={() => void vote(review.id)}>
                {review.voted ? t("review.marked") : t("review.helpful")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
