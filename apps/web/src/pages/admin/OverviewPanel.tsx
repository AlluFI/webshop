import { useEffect, useState } from "react";
import {
  SALES_GROUPS,
  SALES_RANGES,
  type OverviewReport,
  type SalesGroup,
  type SalesRange,
} from "@volt/shared";
import { api } from "../../api";
import { money } from "../../product";

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

export function OverviewPanel({ token }: { token: string }) {
  const [range, setRange] = useState<SalesRange>("last_30_days");
  const [group, setGroup] = useState<"" | SalesGroup>("");
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ range });
    if (group) params.set("group", group);
    void api<OverviewReport>(`/admin/reports/overview?${params}`, { token })
      .then((next) => {
        setReport(next);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [token, range, group]);

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Overview</h2>
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
      </div>
      {report && (
        <>
          <div className="sales-kpis">
            <div className="sales-kpi">
              <span>Customer amount</span>
              <strong>{money(report.totals.customerAmount)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Product sales</span>
              <strong>{money(report.totals.productSales)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Shipping</span>
              <strong>{money(report.totals.shipping)}</strong>
            </div>
            <div className="sales-kpi">
              <span>VAT included</span>
              <strong>{money(report.totals.vat)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Net of VAT</span>
              <strong>{money(report.totals.netOfVat)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Refunds</span>
              <strong>{money(report.totals.refunds)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Net sales</span>
              <strong>{money(report.totals.netSales)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Margin</span>
              <strong>{money(report.totals.margin)}</strong>
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
              <span>AOV</span>
              <strong>{money(report.totals.aov)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Customers</span>
              <strong>{report.totals.customers}</strong>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Units</th>
                  <th scope="col">Customers</th>
                  <th scope="col">Customer amount</th>
                  <th scope="col">Product sales</th>
                  <th scope="col">Shipping</th>
                  <th scope="col">VAT</th>
                  <th scope="col">Net of VAT</th>
                  <th scope="col">Refunds</th>
                  <th scope="col">Net sales</th>
                  <th scope="col">Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.series.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td className="num">{row.orders}</td>
                    <td className="num">{row.units}</td>
                    <td className="num">{row.customers}</td>
                    <td className="num">{money(row.customerAmount)}</td>
                    <td className="num">{money(row.productSales)}</td>
                    <td className="num">{money(row.shipping)}</td>
                    <td className="num">{money(row.vat)}</td>
                    <td className="num">{money(row.netOfVat)}</td>
                    <td className="num">{money(row.refunds)}</td>
                    <td className="num">{money(row.netSales)}</td>
                    <td className="num">{money(row.margin)}</td>
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
