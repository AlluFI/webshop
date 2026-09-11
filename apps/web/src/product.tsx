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
  images: { url: string; altText: string }[];
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
  return (
    <article className="card">
      <Link to={`/products/${product.slug}`}>
        <img src={product.images[0]?.url} alt={product.images[0]?.altText || product.name} />
        <div className="card-body">
          <p className="muted">{product.brand.name}</p>
          <h2 style={{ fontSize: "1.05rem", margin: "4px 0 8px" }}>{product.name}</h2>
          <p className="stars" aria-label={`${product.averageRating} out of 5`}>
            {stars(product.averageRating)}
          </p>
          <p className="price">{money(product.price)}</p>
        </div>
      </Link>
      <div className="card-body" style={{ paddingTop: 0 }}>
        <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} compact />
      </div>
    </article>
  );
}
