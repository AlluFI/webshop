"use client";

import { useRouter } from "next/navigation";
import type { CatalogResponse } from "@/lib/product";
import { useI18n } from "./i18n";

type Props = {
  query: Record<string, string>;
  facets: CatalogResponse["facets"];
};

export function CatalogFilters({ query, facets }: Props) {
  const router = useRouter();
  const { t } = useI18n();

  function update(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  return (
    <aside className="filters" aria-label={t("catalog.filters")}>
      <h2>{t("catalog.refine")}</h2>
      <label htmlFor="category">{t("catalog.category")}</label>
      <select
        id="category"
        value={query.category || ""}
        onChange={(event) => update("category", event.target.value)}
      >
        <option value="">{t("common.all")}</option>
        {facets.categories.map((facet) => (
          <option key={facet.slug} value={facet.slug}>
            {facet.name} ({facet.count})
          </option>
        ))}
      </select>
      <label htmlFor="brand">{t("catalog.brand")}</label>
      <select id="brand" value={query.brand || ""} onChange={(event) => update("brand", event.target.value)}>
        <option value="">{t("common.all")}</option>
        {facets.brands.map((facet) => (
          <option key={facet.slug} value={facet.slug}>
            {facet.name} ({facet.count})
          </option>
        ))}
      </select>
      <label htmlFor="minPrice">{t("catalog.minPrice")}</label>
      <input
        id="minPrice"
        type="number"
        min={0}
        defaultValue={query.minPrice || ""}
        onBlur={(event) => update("minPrice", event.target.value)}
      />
      <label htmlFor="maxPrice">{t("catalog.maxPrice")}</label>
      <input
        id="maxPrice"
        type="number"
        min={0}
        defaultValue={query.maxPrice || ""}
        onBlur={(event) => update("maxPrice", event.target.value)}
      />
      <label htmlFor="minRating">{t("catalog.minRating")}</label>
      <select
        id="minRating"
        value={query.minRating || ""}
        onChange={(event) => update("minRating", event.target.value)}
      >
        <option value="">{t("common.any")}</option>
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
  const { t } = useI18n();
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
    <div className="toolbar catalog-toolbar">
      <h1>
        {heading} <span className="muted">({total})</span>
      </h1>
      <div className="toolbar-actions">
        <label>
          {t("catalog.sort")}{" "}
          <select value={query.sort || "relevance"} onChange={(event) => update("sort", event.target.value)}>
            <option value="relevance">{t("catalog.sortRelevance")}</option>
            <option value="price_asc">{t("catalog.sortPriceAsc")}</option>
            <option value="price_desc">{t("catalog.sortPriceDesc")}</option>
            <option value="rating">{t("catalog.sortRating")}</option>
          </select>
        </label>
        <fieldset className="view-toggle">
          <legend className="skip">{t("catalog.layout")}</legend>
          <button type="button" className={view === "grid" ? "primary" : "ghost"} onClick={() => update("view", "grid")}>
            {t("catalog.grid")}
          </button>
          <button type="button" className={view === "list" ? "primary" : "ghost"} onClick={() => update("view", "list")}>
            {t("catalog.list")}
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
  const { t } = useI18n();

  function go(nextPage: number) {
    const next = new URLSearchParams(query);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={t("catalog.pages")}>
      <button className="ghost" type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        {t("common.previous")}
      </button>
      <span className="muted">{t("catalog.pageOf", { page, total: totalPages })}</span>
      <button className="ghost" type="button" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        {t("common.next")}
      </button>
    </nav>
  );
}
