import { Link } from "react-router-dom";
import { STORE_CURRENCY } from "@volt/shared";
import { AddToCartButton } from "./cart";

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  stockQuantity: number;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  images: { url: string; thumbUrl?: string; altText: string }[];
  featured?: boolean;
  weightKg: number;
  weightLb: number;
  dimensions: {
    metric: { lengthCm: number; widthCm: number; heightCm: number };
    imperial: { lengthIn: number; widthIn: number; heightIn: number };
  };
  averageRating: number;
  reviewCount: number;
  attributes: { name: string; value: string }[];
};

export function money(value: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: STORE_CURRENCY }).format(value);
}

export function stars(value: number) {
  const rounded = Math.round(value);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

export function ProductCard({ product }: { product: Product }) {
  const href = `/products/${product.slug}`;
  const image = product.images[0];

  return (
    <article className="card">
      <Link className="card-media" to={href}>
        {image?.thumbUrl || image?.url ? (
          <img src={image.thumbUrl || image.url} alt={image.altText || product.name} />
        ) : (
          <span className="photo-fallback" role="img" aria-label={product.name}>
            {product.name}
          </span>
        )}
      </Link>
      <div className="card-body">
        <p className="muted">{product.brand.name}</p>
        <h2 className="card-title">
          <Link to={href}>{product.name}</Link>
        </h2>
        <p className="stars" aria-label={`${product.averageRating} out of 5`}>
          {stars(product.averageRating)}
          {product.reviewCount > 0 ? <span className="muted"> ({product.reviewCount})</span> : null}
        </p>
        {product.description ? <p className="card-excerpt">{product.description}</p> : null}
      </div>
      <div className="card-actions">
        <p className="price">{money(product.price)}</p>
        <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} compact />
      </div>
    </article>
  );
}
