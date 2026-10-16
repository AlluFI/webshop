import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import type { Category, Product } from "@/lib/product";
import { serverApi } from "@/lib/server-api";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "Volt & Co — Electronics",
  "Shop headphones, laptops, phones, and home tech. Metric and imperial specs, honest stock, and Stripe sandbox checkout.",
);

export default async function HomePage() {
  let featured: Product[] = [];
  let categories: Category[] = [];
  let error = "";

  try {
    const data = await serverApi<{ items: Product[] }>("/products?featured=true&pageSize=8&sort=rating");
    featured = data.items;
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load featured products.";
  }

  try {
    const data = await serverApi<{ items: Category[] }>("/categories");
    categories = data.items;
  } catch {
    categories = [];
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Electronics &amp; technology</p>
          <h1>Gear that earns its keep.</h1>
          <p>
            Headphones, repairable laptops, phones, and home tech — specified in both metric and
            imperial, easy to filter, and sold without the circus.
          </p>
          <div className="actions">
            <Link className="button" href="/catalog">
              Browse the catalog
            </Link>
            <Link className="ghost" href="/about">
              About the shop
            </Link>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="kicker">Why Volt</p>
            <h2>Clear specs. Real stock.</h2>
            <p className="muted">
              Every listing shows weight and size in metric and imperial, live inventory, and reviews
              from people who actually bought the product.
            </p>
          </div>
        </div>
      </section>
      <h2>Collections</h2>
      <div className="grid collections">
        {categories.map((category) => (
          <Link className="card collection-card" key={category.slug} href={`/catalog?category=${category.slug}`}>
            <div className="card-body">
              <h3>{category.name}</h3>
              <p className="muted">{category.description || "Shop this aisle"}</p>
              {category._count && <p className="muted">{category._count.products} products</p>}
            </div>
          </Link>
        ))}
      </div>
      <h2>Featured</h2>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {featured.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}
