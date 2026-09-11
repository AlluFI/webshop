import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ProductCard, type Product } from "../product";

type Facet = { slug: string; name: string; count: number };
type ListResponse = {
  items: Product[];
  total: number;
  facets: {
    brands: Facet[];
    categories: Facet[];
    price: { min: number; max: number };
  };
};

export function CatalogPage({ featuredOnly = false }: { featuredOnly?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const next = new URLSearchParams(params);
    if (featuredOnly) next.set("sort", params.get("sort") || "relevance");
    if (!next.get("pageSize")) next.set("pageSize", "24");
    return next.toString();
  }, [params, featuredOnly]);

  useEffect(() => {
    setError("");
    const path = featuredOnly
      ? "/products?featured=true&pageSize=8&sort=rating"
      : `/products?${query}`;
    void api<ListResponse>(path)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [query, featuredOnly]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  if (featuredOnly) {
    const featured = data?.items.filter((item) => item) ?? [];
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
              <Link className="button" to="/catalog">
                Browse the catalog
              </Link>
              <Link className="ghost" to="/register">
                Create an account
              </Link>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="kicker">Collections</p>
              <h2>Shop by aisle</h2>
              <p className="muted">Audio, computers, phones, wearables, smart home, accessories.</p>
            </div>
          </div>
        </section>
        <h2>Featured</h2>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          {(featured.slice(0, 8) || []).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="layout-split">
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
            {params.get("q") ? `Results for “${params.get("q")}”` : "Catalog"}{" "}
            <span className="muted">{data ? `(${data.total})` : ""}</span>
          </h1>
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
        </div>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          {data?.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
