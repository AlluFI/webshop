"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { formatStoreDate } from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { stars } from "@/lib/product";
import { useAuth } from "./auth";

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

export function ProductReviews({ slug }: { slug: string }) {
  const { user, accessToken } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ items: Review[] }>(`/products/${slug}/reviews?sort=helpful`, { token: accessToken })
      .then((data) => setReviews(data.items))
      .catch(() => setReviews([]));
  }, [slug, accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setCanReview(false);
      return;
    }
    void api<{ canReview: boolean }>(`/products/${slug}/reviews/eligibility`, { token: accessToken })
      .then((data) => setCanReview(data.canReview))
      .catch(() => setCanReview(false));
  }, [slug, accessToken]);

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ review: Review }>(`/products/${slug}/reviews`, {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({
          stars: Number(form.get("stars")),
          title: String(form.get("title") || ""),
          body: String(form.get("body") || ""),
        }),
      });
      setReviews((items) => [result.review, ...items]);
      setCanReview(false);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the review");
    }
  }

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
      <h2>Reviews</h2>
      {error && <p className="error">{error}</p>}
      {canReview && (
        <form className="panel" onSubmit={(event) => void onReview(event)}>
          <h3>Write a review</h3>
          <label className="field">
            <span>Stars</span>
            <select name="stars" defaultValue="5">
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Title (optional)</span>
            <input name="title" />
          </label>
          <label className="field">
            <span>Your review</span>
            <textarea name="body" rows={4} required minLength={10} />
          </label>
          <button className="primary" type="submit">
            Publish
          </button>
        </form>
      )}
      {!user && (
        <p className="muted">
          <Link href="/login">Sign in</Link> after buying this product to leave a review.
        </p>
      )}
      {reviews.length === 0 && <p className="muted">No published reviews yet.</p>}
      <ul className="review-list">
        {reviews.map((review) => (
          <li key={review.id} className="panel">
            <p className="stars">{stars(review.stars)}</p>
            {review.title && <h3>{review.title}</h3>}
            <p>{review.body}</p>
            <p className="muted">
              {review.author} · {formatStoreDate(review.createdAt)} · {review.helpfulCount} found this
              helpful
            </p>
            {accessToken && (
              <button className="link" type="button" disabled={review.voted} onClick={() => void vote(review.id)}>
                {review.voted ? "Marked helpful" : "Helpful"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
