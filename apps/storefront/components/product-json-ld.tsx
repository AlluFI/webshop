import { STORE_CURRENCY } from "@volt/shared";
import type { Product } from "@/lib/product";

export function ProductJsonLd({ product }: { product: Product }) {
  const image = product.images[0];
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.slug,
    mpn: product.modelCode || product.slug,
    brand: { "@type": "Brand", name: product.brand.name },
    color: product.colorName || undefined,
    warranty:
      product.warrantyMonths || product.warrantyNote
        ? {
            "@type": "WarrantyPromise",
            durationOfWarranty: product.warrantyMonths
              ? `P${product.warrantyMonths}M`
              : undefined,
            warrantyScope: product.warrantyNote || undefined,
          }
        : undefined,
    image: image?.url ? [image.url] : undefined,
    aggregateRating:
      product.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.averageRating,
            reviewCount: product.reviewCount,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: STORE_CURRENCY,
      price: product.price.toFixed(2),
      availability:
        product.stockQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
