import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ProductCard, type Product } from "../product";
import { PageMeta } from "../seo";

type Facet = { slug: string; name: string; count: number };
type ListResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    brands: Facet[];
    categories: Facet[];
    price: { min: number; max: number };
  };
};

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const view = params.get("view") === "list" ? "list" : "grid";
  const page = Number(params.get("page") || 1);

  const query = useMemo(() => {
    const next = new URLSearchParams(params);
    if (!next.get("pageSize")) next.set("pageSize", "12");
    return next.toString();
  }, [params]);

  useEffect(() => {
    setError("");
    void api<ListResponse>(`/products?${query}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [query]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const heading = params.get("q") ? `Results for “${params.get("q")}”` : "Catalog";
  const title = params.get("q") ? `${heading} — Volt & Co` : "Catalog — Volt & Co";

  return (
    <div className="layout-split">
      <PageMeta
        title={title}
        description="Filter electronics by category, brand, price, and rating. Sort by relevance, price, or reviews."
      />
      <aside className="filters" aria-label="Filters">
        <h2>Refine</h2>
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={params.get("category") || ""}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">All</option>
          {data?.facets.categories.map((facet) => (
            <option key={facet.slug} value={facet.slug}>
              {facet.name} ({facet.count})
            </option>
          ))}
        </select>
        <label htmlFor="brand">Brand</label>
        <select
          id="brand"
          value={params.get("brand") || ""}
          onChange={(event) => update("brand", event.target.value)}
        >
          <option value="">All</option>
          {data?.facets.brands.map((facet) => (
            <option key={facet.slug} value={facet.slug}>
              {facet.name} ({facet.count})
            </option>
          ))}
        </select>
        <label htmlFor="minPrice">Min price</label>
        <input
          id="minPrice"
          type="number"
          min={0}
          value={params.get("minPrice") || ""}
          onChange={(event) => update("minPrice", event.target.value)}
        />
        <label htmlFor="maxPrice">Max price</label>
        <input
          id="maxPrice"
          type="number"
          min={0}
          value={params.get("maxPrice") || ""}
          onChange={(event) => update("maxPrice", event.target.value)}
        />
        <label htmlFor="minRating">Min rating</label>
        <select
          id="minRating"
          value={params.get("minRating") || ""}
          onChange={(event) => update("minRating", event.target.value)}
        >
          <option value="">Any</option>
          <option value="4">4+</option>
          <option value="3">3+</option>
        </select>
      </aside>
      <section>
        <div className="toolbar">
          <h1>
            {heading} <span className="muted">{data ? `(${data.total})` : ""}</span>
          </h1>
          <div className="toolbar-actions">
            <label>
              Sort{" "}
              <select
                value={params.get("sort") || "relevance"}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="rating">Rating</option>
              </select>
            </label>
            <fieldset className="view-toggle">
              <legend className="skip">Layout</legend>
              <button type="button" className={view === "grid" ? "primary" : "ghost"} onClick={() => update("view", "grid")}>
                Grid
              </button>
              <button type="button" className={view === "list" ? "primary" : "ghost"} onClick={() => update("view", "list")}>
                List
              </button>
            </fieldset>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className={view === "list" ? "list-view" : "grid"}>
          {data?.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {totalPages > 1 && (
          <nav className="pagination" aria-label="Catalog pages">
            <button
              className="ghost"
              type="button"
              disabled={page <= 1}
              onClick={() => update("page", String(page - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {page} of {totalPages}
            </span>
            <button
              className="ghost"
              type="button"
              disabled={page >= totalPages}
              onClick={() => update("page", String(page + 1))}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
