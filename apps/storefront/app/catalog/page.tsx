import { CatalogFilters, CatalogPager, CatalogToolbar } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import type { CatalogResponse } from "@/lib/product";
import { queryString } from "@/lib/product";
import { serverApi } from "@/lib/server-api";
import { pageMetadata } from "@/lib/seo";

type Search = Record<string, string | string[] | undefined>;

function pick(search: Search, key: string) {
  const value = search[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function asQuery(search: Search) {
  return {
    q: pick(search, "q"),
    category: pick(search, "category"),
    brand: pick(search, "brand"),
    minPrice: pick(search, "minPrice"),
    maxPrice: pick(search, "maxPrice"),
    minRating: pick(search, "minRating"),
    sort: pick(search, "sort"),
    view: pick(search, "view"),
    page: pick(search, "page"),
    pageSize: pick(search, "pageSize") || "12",
  };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }) {
  const query = asQuery(await searchParams);
  const heading = query.q ? `Results for “${query.q}”` : "Catalog";
  return pageMetadata(
    query.q ? `${heading} — Volt & Co` : "Catalog — Volt & Co",
    "Filter electronics by category, brand, price, and rating. Sort by relevance, price, or reviews.",
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = asQuery(await searchParams);
  const qs = queryString(query);
  let data: CatalogResponse | null = null;
  let error = "";

  try {
    data = await serverApi<CatalogResponse>(`/products?${qs}`);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the catalog.";
  }

  const heading = query.q ? `Results for “${query.q}”` : "Catalog";
  const view = query.view === "list" ? "list" : "grid";
  const page = Number(query.page || 1);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="layout-split">
      <CatalogFilters
        query={query}
        facets={data?.facets ?? { brands: [], categories: [], price: { min: 0, max: 0 } }}
      />
      <section>
        <CatalogToolbar query={query} heading={heading} total={data?.total ?? 0} />
        {error && <p className="error">{error}</p>}
        <div className={view === "list" ? "list-view" : "grid"}>
          {data?.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <CatalogPager query={query} page={page} totalPages={totalPages} />
      </section>
    </div>
  );
}
