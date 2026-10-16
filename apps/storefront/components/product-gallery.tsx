"use client";

import { useState } from "react";
import type { Product } from "@/lib/product";

export function ProductGallery({ product }: { product: Product }) {
  const [activeImage, setActiveImage] = useState(0);
  const image = product.images[activeImage] || product.images[0];

  return (
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
  );
}
