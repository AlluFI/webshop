"use client";

import Link from "next/link";
import { stars, type Product } from "@/lib/product";
import { ProductPrice } from "./product-price";
import { AddToCartButton } from "./cart";
import { ProductSaveActions } from "./product-actions";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const href = `/products/${product.slug}`;
  const image = product.images[0];
  const TitleTag = compact ? "h3" : "h2";

  return (
    <article className={compact ? "card card-compact" : "card"}>
      <Link className="card-media" href={href}>
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
        <TitleTag className="card-title">
          <Link href={href}>{product.name}</Link>
        </TitleTag>
        <p className="stars" aria-label={`${product.averageRating} out of 5`}>
          {stars(product.averageRating)}
          {product.reviewCount > 0 ? <span className="muted"> ({product.reviewCount})</span> : null}
        </p>
        {!compact && product.description ? <p className="card-excerpt">{product.description}</p> : null}
      </div>
      <div className="card-actions">
        <ProductPrice product={product} />
        <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} compact />
        {!compact ? <ProductSaveActions product={product} compact /> : null}
      </div>
    </article>
  );
}
