import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { formatStoreDate } from "@volt/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { AddToCartButton } from "../cart";
import { ProductCard, money, stars, type Product } from "../product";
import { ProductFacts } from "../product-facts";
import { PageMeta } from "../seo";

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

type Detail = Product & { related?: Product[] };

export function ProductPage() {
  const { slug } = useParams();
  const { user, accessToken } = useAuth();
  const [product, setProduct] = useState<Detail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!slug) return;
    void api<Detail>(`/products/${slug}`)
      .then((item) => {
        setProduct(item);
        setActiveImage(0);
      })
      .catch((err: Error) => setError(err.message));
    void api<{ items: Review[] }>(`/products/${slug}/reviews?sort=helpful`, { token: accessToken })
      .then((data) => setReviews(data.items))
      .catch(() => setReviews([]));
  }, [slug, accessToken]);

  useEffect(() => {
    if (!slug || !accessToken) {
      setCanReview(false);
      return;
    }
    void api<{ canReview: boolean }>(`/products/${slug}/reviews/eligibility`, { token: accessToken })
      .then((data) => setCanReview(data.canReview))
      .catch(() => setCanReview(false));
  }, [slug, accessToken]);

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || !accessToken) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ review: Review; product: { average: number; count: number } }>(
        `/products/${slug}/reviews`,
        {
          method: "POST",
          token: accessToken,
          body: JSON.stringify({
            stars: Number(form.get("stars")),
            title: String(form.get("title") || ""),
            body: String(form.get("body") || ""),
          }),
        },
      );
      setReviews((items) => [result.review, ...items]);
      setCanReview(false);
      setProduct((current) =>
        current
          ? { ...current, averageRating: result.product.average, reviewCount: result.product.count }
          : current,
      );
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

  if (error && !product) return <p className="error">{error}</p>;
  if (!product) return <p>Loading…</p>;

  const image = product.images[activeImage] || product.images[0];

  return (
    <>
      <PageMeta
        title={`${product.name} — Volt & Co`}
        description={product.description}
      />
      <article className="pdp">
        <div>
          {image?.url ? (
            <img src={image.url} alt={image.altText || product.name} />
          ) : (
            <div className="photo-fallback" role="img" aria-label={product.name}>
              {product.name}
            </div>
          )}
          {product.images.length > 1 && (
            <div className="thumbs">
              {product.images.map((item, index) => (
                <button
                  key={item.url}
                  type="button"
                  className={index === activeImage ? "thumb active" : "thumb"}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={item.thumbUrl || item.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="kicker">
            <Link to={`/catalog?category=${product.category.slug}`}>{product.category.name}</Link>
            {" · "}
            {product.brand.name}
          </p>
          <h1>{product.name}</h1>
          <p className="stars">
            {stars(product.averageRating)}{" "}
            <span className="muted">({product.reviewCount} reviews)</span>
          </p>
          <p className="price" style={{ fontSize: "1.4rem" }}>
            {money(product.price)}
          </p>
          <p>{product.description}</p>
          <p className="muted">
            {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : "Currently unavailable"}
          </p>
          <div className="actions">
            <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} />
          </div>
          <ProductFacts product={product} />
          <div className="dims">
            <div>
              <h2>Metric</h2>
              <p>
                {product.weightKg} kg · {product.dimensions.metric.lengthCm} ×{" "}
                {product.dimensions.metric.widthCm} × {product.dimensions.metric.heightCm} cm
              </p>
            </div>
            <div>
              <h2>Imperial</h2>
              <p>
                {product.weightLb} lb · {product.dimensions.imperial.lengthIn} ×{" "}
                {product.dimensions.imperial.widthIn} × {product.dimensions.imperial.heightIn} in
              </p>
            </div>
          </div>
        </div>
      </article>
      <section>
        <h2>Reviews</h2>
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
            <Link to="/login">Sign in</Link> after buying this product to leave a review.
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
                {review.author} · {formatStoreDate(review.createdAt)} · {review.helpfulCount}{" "}
                found this helpful
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
      {product.related && product.related.length > 0 && (
        <section>
          <h2>Related products</h2>
          <div className="grid">
            {product.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
