import { useEffect, useState } from "react";
import { AUDIT_ENTITIES, formatStoreDateTime } from "@volt/shared";
import { api } from "../../api";

export function LogPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    {
      id: string;
      createdAt: string;
      actor: string;
      actorName: string;
      entity: string;
      target: string;
      changes: { field: string; from: string; to: string }[];
    }[]
  >([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState<string>("");
  const [error, setError] = useState("");
  const pageSize = 30;

  async function load(nextPage = page, nextEntity = entity) {
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (nextEntity) query.set("entity", nextEntity);
    const data = await api<{ items: typeof items; total: number; page: number }>(`/admin/audit?${query}`, {
      token,
    });
    setItems(data.items);
    setTotal(data.total);
    setPage(data.page);
  }

  useEffect(() => {
    void load(1, entity).catch((err: Error) => setError(err.message));
  }, [token, entity]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Change log</h2>
        <label className="field">
          <span>Table</span>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {AUDIT_ENTITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">Staff edits to products, categories, orders, reviews, shipping, and users.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Who</th>
              <th scope="col">Table</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4}>No changes recorded yet.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="num">
                    {formatStoreDateTime(item.createdAt)}
                  </td>
                  <td>
                    {item.actorName}
                    {item.actor && item.actor !== item.actorName ? (
                      <>
                        <br />
                        <span className="muted">{item.actor}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {item.entity}
                    {item.target ? (
                      <>
                        <br />
                        <span className="muted">{item.target}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {item.changes.length ? (
                      <ul className="audit-changes">
                        {item.changes.map((change) => (
                          <li key={`${item.id}-${change.field}`}>
                            <span className="muted">{change.field}:</span> {change.from} → {change.to}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pagination">
          <button className="ghost" type="button" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button className="ghost" type="button" disabled={page >= pages} onClick={() => void load(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

