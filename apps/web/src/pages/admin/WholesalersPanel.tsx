import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatStoreDateTime, LOW_STOCK_THRESHOLD, suggestedRestockQty } from "@volt/shared";
import { api, ApiError } from "../../api";
import { Modal } from "./Modal";

type SupplierProduct = {
  id: string;
  name: string;
  slug: string;
  stockQuantity: number;
  wholesaleSku: string | null;
};

type PurchaseOrder = {
  id: string;
  reference: string;
  note: string | null;
  createdAt: string;
  itemCount: number;
  summary: string;
};

type Wholesaler = {
  id: string;
  name: string;
  email: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  productCount: number;
  lowStockCount: number;
  products: SupplierProduct[];
  purchaseOrders: PurchaseOrder[];
};

const emptyForm = {
  name: "",
  email: "",
  contactName: "",
  phone: "",
  address: "",
  notes: "",
};

export function WholesalersPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Wholesaler[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Wholesaler | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [ordering, setOrdering] = useState<Wholesaler | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api<{ items: Wholesaler[] }>("/admin/wholesalers", { token });
    setItems(data.items);
    return data.items;
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setError("");
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function startEdit(row: Wholesaler) {
    setError("");
    setEditing(row);
    setForm({
      name: row.name,
      email: row.email,
      contactName: row.contactName || "",
      phone: row.phone || "",
      address: row.address || "",
      notes: row.notes || "",
    });
    setFormOpen(true);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await api(`/admin/wholesalers/${editing.id}`, { method: "PATCH", token, body: JSON.stringify(form) });
      } else {
        await api("/admin/wholesalers", { method: "POST", token, body: JSON.stringify(form) });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save wholesaler");
    }
  }

  async function openOrder(row: Wholesaler) {
    setError("");
    setNotice("");
    const detail = await api<Wholesaler>(`/admin/wholesalers/${row.id}`, { token });
    setOrdering(detail);
    setNote("");
    setQtys(
      Object.fromEntries(
        detail.products.map((product) => [product.id, String(suggestedRestockQty(product.stockQuantity) || "")]),
      ),
    );
  }

  function closeOrder() {
    if (busy) return;
    setOrdering(null);
    setNote("");
  }

  const lines = useMemo(
    () =>
      ordering?.products
        .map((product) => ({ product, quantity: Number(qtys[product.id] || 0) }))
        .filter((line) => line.quantity > 0) ?? [],
    [ordering, qtys],
  );

  async function sendOrder() {
    if (!ordering || !lines.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<{ reference: string; wholesaler: { email: string } }>(
        `/admin/wholesalers/${ordering.id}/orders`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            note,
            items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          }),
        },
      );
      setNotice(`Purchase order ${created.reference} emailed to ${created.wholesaler.email}.`);
      const next = await load();
      const updated = next.find((row) => row.id === ordering.id);
      if (updated) {
        const detail = await api<Wholesaler>(`/admin/wholesalers/${updated.id}`, { token });
        setOrdering(detail);
        setQtys(
          Object.fromEntries(
            detail.products.map((product) => [product.id, String(suggestedRestockQty(product.stockQuantity) || "")]),
          ),
        );
        setNote("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send restock order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && !formOpen && !ordering && <p className="banner error">{error}</p>}
      {notice && !ordering && <p className="banner">{notice}</p>}
      <div className="toolbar">
        <div>
          <h2>Wholesalers</h2>
          <p className="muted">Suppliers for warehouse restock. Send a purchase order and Mailpit receives the email.</p>
        </div>
        <button className="primary" type="button" onClick={openCreate}>
          Add wholesaler
        </button>
      </div>

      <Modal open={formOpen} title={editing ? "Edit wholesaler" : "New wholesaler"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onSave(event)}>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </label>
          <label className="field">
            <span>Order email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <div className="dims">
            <label className="field">
              <span>Contact</span>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Address</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="actions">
            <button className="primary" type="submit">
              {editing ? "Save changes" : "Create"}
            </button>
            <button className="ghost" type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        wide
        open={Boolean(ordering)}
        title={ordering ? `Restock ${ordering.name}` : "Restock"}
        onClose={closeOrder}
      >
        {ordering && (
          <>
            {error && <p className="banner error">{error}</p>}
            {notice && <p className="banner">{notice}</p>}
            <p className="muted">
              {ordering.email}
              {ordering.contactName ? ` · ${ordering.contactName}` : ""}
            </p>
            {ordering.products.length === 0 ? (
              <p>No products are assigned to this wholesaler yet. Set the supplier on each product first.</p>
            ) : (
              <ul className="pick-lines restock-lines">
                {ordering.products.map((product) => (
                  <li key={product.id} className="restock-line">
                    <div>
                      <strong>
                        <Link to={`/products/${product.slug}`}>{product.name}</Link>
                      </strong>
                      <p className="muted">
                        <span className="locator-code">{product.wholesaleSku || "—"}</span>
                        {" · "}
                        <span className={product.stockQuantity < LOW_STOCK_THRESHOLD ? "stock-low" : undefined}>
                          on hand {product.stockQuantity}
                        </span>
                      </p>
                    </div>
                    <label className="field restock-qty">
                      <span>Qty</span>
                      <input
                        className="qty-input"
                        inputMode="numeric"
                        aria-label={`Quantity for ${product.name}`}
                        value={qtys[product.id] ?? ""}
                        onChange={(e) => setQtys({ ...qtys, [product.id]: e.target.value })}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="field">
              <span>Note to supplier</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="actions">
              <button className="primary" type="button" disabled={busy || !lines.length} onClick={() => void sendOrder()}>
                {busy ? "Sending…" : "Send restock order"}
              </button>
              <button className="ghost" type="button" disabled={busy} onClick={closeOrder}>
                Close
              </button>
            </div>
            {ordering.purchaseOrders.length > 0 && (
              <div className="recent-pos">
                <h3>Recent orders</h3>
                <ul>
                  {ordering.purchaseOrders.map((order) => (
                    <li key={order.id}>
                      <strong>{order.reference}</strong> · {formatStoreDateTime(order.createdAt)} · {order.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Wholesaler</th>
              <th scope="col">Email</th>
              <th scope="col">Products</th>
              <th scope="col">Low stock</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  {item.contactName ? <div className="muted">{item.contactName}</div> : null}
                </td>
                <td>{item.email}</td>
                <td className="num">{item.productCount}</td>
                <td className={item.lowStockCount ? "num stock-low" : "num"}>{item.lowStockCount}</td>
                <td>
                  <div className="row-actions">
                    <button className="link" type="button" onClick={() => void openOrder(item)}>
                      Order stock
                    </button>
                    <button className="link" type="button" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
