"use client";

import { useRouter } from "next/navigation";
import type { CatalogResponse } from "@/lib/product";

type Props = {
  query: Record<string, string>;
  facets: CatalogResponse["facets"];
};

export function CatalogFilters({ query, facets }: Props) {
  const router = useRouter();

  function update(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  return (
    <aside className="filters" aria-label="Filters">
      <h2>Refine</h2>
      <label htmlFor="category">Category</label>
      <select
        id="category"
        value={query.category || ""}
        onChange={(event) => update("category", event.target.value)}
      >
        <option value="">All</option>
        {facets.categories.map((facet) => (
          <option key={facet.slug} value={facet.slug}>
            {facet.name} ({facet.count})
          </option>
        ))}
      </select>
      <label htmlFor="brand">Brand</label>
      <select id="brand" value={query.brand || ""} onChange={(event) => update("brand", event.target.value)}>
        <option value="">All</option>
        {facets.brands.map((facet) => (
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
        defaultValue={query.minPrice || ""}
        onBlur={(event) => update("minPrice", event.target.value)}
      />
      <label htmlFor="maxPrice">Max price</label>
      <input
        id="maxPrice"
        type="number"
        min={0}
        defaultValue={query.maxPrice || ""}
        onBlur={(event) => update("maxPrice", event.target.value)}
      />
      <label htmlFor="minRating">Min rating</label>
      <select
        id="minRating"
        value={query.minRating || ""}
        onChange={(event) => update("minRating", event.target.value)}
      >
        <option value="">Any</option>
        <option value="4">4+</option>
        <option value="3">3+</option>
      </select>
    </aside>
  );
}

export function CatalogToolbar({
  query,
  heading,
  total,
}: {
  query: Record<string, string>;
  heading: string;
  total: number;
}) {
  const router = useRouter();
  const view = query.view === "list" ? "list" : "grid";

  function update(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  return (
    <div className="toolbar">
      <h1>
        {heading} <span className="muted">({total})</span>
      </h1>
      <div className="toolbar-actions">
        <label>
          Sort{" "}
          <select value={query.sort || "relevance"} onChange={(event) => update("sort", event.target.value)}>
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
  );
}

export function CatalogPager({
  query,
  page,
  totalPages,
}: {
  query: Record<string, string>;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();

  function go(nextPage: number) {
    const next = new URLSearchParams(query);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Catalog pages">
      <button className="ghost" type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages}
      </span>
      <button className="ghost" type="button" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        Next
      </button>
    </nav>
  );
}
