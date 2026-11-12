import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import type { Category, Product } from "@/lib/product";
import { getTranslator } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`Volt & Co — ${t("home.kicker")}`, t("home.lead"));
}

export default async function HomePage() {
  const t = await getTranslator();
  let featured: Product[] = [];
  let categories: Category[] = [];
  let error = "";

  try {
    const data = await serverApi<{ items: Product[] }>("/products?featured=true&pageSize=4&sort=rating");
    featured = data.items;
  } catch (err) {
    error = err instanceof Error ? err.message : t("home.loadError");
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
          <p className="kicker">{t("home.kicker")}</p>
          <h1>{t("home.title")}</h1>
          <p>{t("home.lead")}</p>
          <div className="actions">
            <Link className="button" href="/catalog">
              {t("home.browse")}
            </Link>
            <Link className="ghost" href="/about">
              {t("home.about")}
            </Link>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="kicker">{t("home.whyKicker")}</p>
            <h2>{t("home.whyTitle")}</h2>
            <p className="muted">{t("home.whyBody")}</p>
          </div>
        </div>
      </section>
      <h2>{t("home.collections")}</h2>
      <div className="grid collections">
        {categories.map((category) => (
          <Link className="card collection-card" key={category.slug} href={`/catalog?category=${category.slug}`}>
            <div className="card-body">
              <h3>{category.name}</h3>
              <p className="muted">{category.description || t("home.shopAisle")}</p>
              {category._count && <p className="muted">{t("home.productCount", { n: category._count.products })}</p>}
            </div>
          </Link>
        ))}
      </div>
      <h2>{t("home.featured")}</h2>
      {error && <p className="error">{error}</p>}
      <div className="home-featured">
        {featured.map((product) => (
          <ProductCard key={product.id} product={product} titleAs="h3" />
        ))}
      </div>
    </>
  );
}
