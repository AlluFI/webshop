import { useEffect, useState } from "react";
import { SALES_RANGES, type CustomersReport, type SalesRange } from "@volt/shared";
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

export function CustomersPanel({ token }: { token: string }) {
  const [range, setRange] = useState<SalesRange>("last_30_days");
  const [report, setReport] = useState<CustomersReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ range });
    void api<CustomersReport>(`/admin/reports/customers?${params}`, { token })
      .then((next) => {
        setReport(next);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [token, range]);

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Customers</h2>
        {report && (
          <p className="muted">
            {report.from} to {report.to}
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
      </div>
      {report && (
        <>
          <div className="sales-kpis">
            <div className="sales-kpi">
              <span>Customers</span>
              <strong>{report.totals.customers}</strong>
            </div>
            <div className="sales-kpi">
              <span>New</span>
              <strong>{report.totals.newCustomers}</strong>
            </div>
            <div className="sales-kpi">
              <span>Returning</span>
              <strong>{report.totals.returningCustomers}</strong>
            </div>
            <div className="sales-kpi">
              <span>Customer amount</span>
              <strong>{money(report.totals.customerAmount)}</strong>
            </div>
            <div className="sales-kpi">
              <span>AOV</span>
              <strong>{money(report.totals.aov)}</strong>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Email</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Units</th>
                  <th scope="col">Customer amount</th>
                </tr>
              </thead>
              <tbody>
                {report.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No buyers in this time frame.
                    </td>
                  </tr>
                ) : (
                  report.items.map((row) => (
                    <tr key={`${row.email}-${row.name}`}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td className="num">{row.orders}</td>
                      <td className="num">{row.units}</td>
                      <td className="num">{money(row.customerAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
