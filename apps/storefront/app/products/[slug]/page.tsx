import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/cart";
import { ProductCard } from "@/components/product-card";
import { ProductFacts } from "@/components/product-facts";
import { ProductGallery } from "@/components/product-gallery";
import { ProductJsonLd } from "@/components/product-json-ld";
import { ProductReviews } from "@/components/reviews";
import { ApiError } from "@/lib/api";
import { money, stars, type Product } from "@/lib/product";
import { serverApi } from "@/lib/server-api";
import { pageMetadata } from "@/lib/seo";

type Detail = Product;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const product = await serverApi<Detail>(`/products/${slug}`);
    return pageMetadata(`${product.name} — Volt & Co`, product.description);
  } catch {
    return pageMetadata("Product — Volt & Co", "This listing was not found in the Volt & Co catalog.");
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: Detail;
  try {
    product = await serverApi<Detail>(`/products/${slug}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <ProductJsonLd product={product} />
      <article className="pdp">
        <ProductGallery product={product} />
        <div>
          <p className="kicker">
            <Link href={`/catalog?category=${product.category.slug}`}>{product.category.name}</Link>
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
      <ProductReviews slug={slug} />
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
