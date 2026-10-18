import { useEffect, useMemo, useState } from "react";
import { SALES_GROUPS, SALES_RANGES, type SalesGroup, type SalesRange } from "@volt/shared";
import { api } from "@/lib/api";
import { money, type Product } from "@/lib/product";

const RANGE_LABELS: Record<SalesRange, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_12_months: "Last 12 months",
  this_week: "This calendar week",
  last_week: "Last calendar week",
  this_month: "This calendar month",
  last_month: "Last calendar month",
  this_year: "This calendar year",
  last_year: "Last calendar year",
};

const GROUP_LABELS: Record<SalesGroup, string> = {
  day: "Day",
  week: "Calendar week",
  month: "Calendar month",
  year: "Calendar year",
};

type SalesReport = {
  range: SalesRange;
  group: SalesGroup;
  from: string;
  to: string;
  series: { key: string; label: string; revenue: number; units: number; vat: number; profit: number; orders: number }[];
  totals: { revenue: number; units: number; vat: number; profit: number; orders: number };
};

export function SalesPanel({ token }: { token: string }) {
  const [range, setRange] = useState<SalesRange>("last_30_days");
  const [group, setGroup] = useState<"" | SalesGroup>("");
  const [productId, setProductId] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([]);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      api<{ items: Product[] }>("/admin/products?pageSize=48", { token }),
      api<{ items: { name: string; slug: string }[] }>("/categories", { token }),
    ])
      .then(([catalog, cats]) => {
        setProducts(catalog.items);
        setCategories(cats.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams({ range });
    if (group) params.set("group", group);
    if (productId) params.set("productId", productId);
    if (category) params.set("category", category);
    void api<SalesReport>(`/admin/sales?${params}`, { token })
      .then((next) => {
        setReport(next);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [token, range, group, productId, category]);

  const maxRevenue = useMemo(
    () => Math.max(...(report?.series.map((row) => row.revenue) ?? [0]), 1),
    [report],
  );

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Sales</h2>
        {report && (
          <p className="muted">
            {report.from} to {report.to} · {GROUP_LABELS[report.group]}
          </p>
        )}
      </div>
      <div className="sales-filters">
        <label className="field">
          <span>Time frame</span>
          <select value={range} onChange={(event) => setRange(event.target.value as SalesRange)}>
            {SALES_RANGES.map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Group by</span>
          <select value={group} onChange={(event) => setGroup(event.target.value as "" | SalesGroup)}>
            <option value="">Auto</option>
            {SALES_GROUPS.map((value) => (
              <option key={value} value={value}>
                {GROUP_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setProductId("");
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Product</span>
          <select
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              if (event.target.value) setCategory("");
            }}
          >
            <option value="">All products</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {report && (
        <>
          <div className="sales-kpis">
            <div className="sales-kpi">
              <span>Product sales</span>
              <strong>{money(report.totals.revenue)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Orders</span>
              <strong>{report.totals.orders}</strong>
            </div>
            <div className="sales-kpi">
              <span>Units</span>
              <strong>{report.totals.units}</strong>
            </div>
            <div className="sales-kpi">
              <span>VAT included</span>
              <strong>{money(report.totals.vat)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Margin</span>
              <strong>{money(report.totals.profit)}</strong>
            </div>
          </div>
          <div
            className="sales-chart"
            role="img"
            aria-label={`Product sales by ${GROUP_LABELS[report.group].toLowerCase()}`}
          >
            {report.series.map((row) => (
              <div key={row.key} className="sales-bar-wrap">
                <div
                  className="sales-bar"
                  style={{ height: `${Math.max(2, (row.revenue / maxRevenue) * 100)}%` }}
                  title={`${row.label}: ${money(row.revenue)}`}
                />
                <span className="sales-bar-label">{row.label}</span>
              </div>
            ))}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Units</th>
                  <th scope="col">Product sales</th>
                  <th scope="col">VAT</th>
                  <th scope="col">Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.series.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td className="num">{row.orders}</td>
                    <td className="num">{row.units}</td>
                    <td className="num">{money(row.revenue)}</td>
                    <td className="num">{money(row.vat)}</td>
                    <td className="num">{money(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
