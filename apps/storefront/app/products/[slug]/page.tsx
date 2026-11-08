import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/cart";
import {
  BackInStockForm,
  ProductDeliveryEstimate,
  ProductSaveActions,
  ProductStockLine,
} from "@/components/product-actions";
import { ProductCard } from "@/components/product-card";
import { ProductFacts } from "@/components/product-facts";
import { ProductGallery } from "@/components/product-gallery";
import { ProductJsonLd } from "@/components/product-json-ld";
import { ProductReviews } from "@/components/reviews";
import { ApiError } from "@/lib/api";
import { ProductPrice } from "@/components/product-price";
import { stars, type Product } from "@/lib/product";
import { getTranslator } from "@/lib/i18n/server";
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
  const t = await getTranslator();
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
            <span className="muted">{t("pdp.reviewsCount", { n: product.reviewCount })}</span>
          </p>
          <ProductPrice product={product} />
          <p>{product.description}</p>
          <ProductStockLine stockQuantity={product.stockQuantity} />
          <ProductDeliveryEstimate />
          <div className="actions">
            <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} />
          </div>
          <ProductSaveActions product={product} />
          {product.stockQuantity <= 0 && <BackInStockForm productId={product.id} />}
          <ProductFacts product={product} />
          <div className="dims">
            <div>
              <h2>{t("pdp.metric")}</h2>
              <p>
                {product.weightKg} kg · {product.dimensions.metric.lengthCm} ×{" "}
                {product.dimensions.metric.widthCm} × {product.dimensions.metric.heightCm} cm
              </p>
            </div>
            <div>
              <h2>{t("pdp.imperial")}</h2>
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
          <h2>{t("pdp.related")}</h2>
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
