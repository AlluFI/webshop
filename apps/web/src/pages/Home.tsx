import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ProductCard, type Product } from "../product";
import { PageMeta } from "../seo";

type Category = { name: string; slug: string; description?: string | null; _count?: { products: number } };

export function HomePage() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ items: Product[] }>("/products?featured=true&pageSize=8&sort=rating")
      .then((data) => setFeatured(data.items))
      .catch((err: Error) => setError(err.message));
    void api<{ items: Category[] }>("/categories")
      .then((data) => setCategories(data.items))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <PageMeta
        title="Volt & Co — Electronics"
        description="Shop headphones, laptops, phones, and home tech. Metric and imperial specs, honest stock, and Stripe sandbox checkout."
      />
      <section className="hero">
        <div>
          <p className="kicker">Electronics &amp; technology</p>
          <h1>Gear that earns its keep.</h1>
          <p>
            Headphones, repairable laptops, phones, and home tech — specified in both metric and
            imperial, easy to filter, and sold without the circus.
          </p>
          <div className="actions">
            <Link className="button" to="/catalog">
              Browse the catalog
            </Link>
            <Link className="ghost" to="/about">
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
          <Link className="card collection-card" key={category.slug} to={`/catalog?category=${category.slug}`}>
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
