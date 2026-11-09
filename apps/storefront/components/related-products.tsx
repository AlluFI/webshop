import type { Product } from "@/lib/product";
import { ProductCard } from "./product-card";

export function RelatedProducts({
  products,
  title,
  kicker,
}: {
  products: Product[];
  title: string;
  kicker?: string;
}) {
  if (!products.length) return null;

  return (
    <section className="related" aria-labelledby="related-heading">
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h2 id="related-heading">{title}</h2>
      <div className="related-rail">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} compact />
        ))}
      </div>
    </section>
  );
}
