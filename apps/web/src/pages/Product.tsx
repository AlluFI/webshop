import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { money, stars, type Product } from "../product";

export function ProductPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    void api<Product>(`/products/${slug}`)
      .then(setProduct)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) return <p className="error">{error}</p>;
  if (!product) return <p>Loading…</p>;

  return (
    <article className="pdp">
      <img src={product.images[0]?.url} alt={product.images[0]?.altText || product.name} />
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
        {product.attributes.length > 0 && (
          <ul>
            {product.attributes.map((attribute) => (
              <li key={`${attribute.name}-${attribute.value}`}>
                <strong>{attribute.name}:</strong> {attribute.value}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
