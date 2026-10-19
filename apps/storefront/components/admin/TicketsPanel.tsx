import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type TicketRow = {
  id: string;
  reference: string;
  externalKey: string;
  kind: string;
  status: string;
  subject: string;
  customerName: string;
  customerEmail: string;
  lastError: string | null;
  createdAt: string;
};

export function TicketsPanel({ token }: { token: string }) {
  const [mode, setMode] = useState("mock");
  const [items, setItems] = useState<TicketRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ mode: string; items: TicketRow[] }>("/admin/tickets", { token })
      .then((data) => {
        setMode(data.mode);
        setItems(data.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  return (
    <div>
      {error ? <p className="banner error">{error}</p> : null}
      <div className="toolbar">
        <h2>Tickets</h2>
      </div>
      <p className="muted">
        Voltie enquiries and claims land here. Mode is <strong>{mode}</strong>
        {mode === "mock"
          ? " — the same Jira-shaped payload is emailed to Mailpit (support@localhost) so the demo works without Jira."
          : " — live webhook delivery is enabled."}
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Ticket</th>
              <th scope="col">Jira key</th>
              <th scope="col">Kind</th>
              <th scope="col">Subject</th>
              <th scope="col">Customer</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No Voltie tickets yet. Ask Voltie to email support or confirm a claim.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code>{row.reference}</code>
                  </td>
                  <td>
                    <code>{row.externalKey}</code>
                  </td>
                  <td>{row.kind}</td>
                  <td>
                    {row.subject}
                    {row.lastError ? <div className="muted">{row.lastError}</div> : null}
                  </td>
                  <td>
                    {row.customerName}
                    <div className="muted">{row.customerEmail}</div>
                  </td>
                  <td>{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
