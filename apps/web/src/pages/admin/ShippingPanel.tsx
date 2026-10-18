import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api";
import { money } from "../../product";
import { Modal } from "./Modal";

export function ShippingPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    {
      id: string;
      code: string;
      name: string;
      description: string | null;
      price: number;
      minDays: number;
      maxDays: number;
      freeThreshold: number | null;
      active: boolean;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof items)[number] | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "0",
    freeThreshold: "",
    minDays: "1",
    maxDays: "3",
    active: true,
  });

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/shipping", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeForm() {
    setOpen(false);
    setEditing(null);
  }

  function startEdit(item: (typeof items)[number]) {
    setError("");
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      freeThreshold: item.freeThreshold == null ? "" : String(item.freeThreshold),
      minDays: String(item.minDays),
      maxDays: String(item.maxDays),
      active: item.active,
    });
    setOpen(true);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError("");
    try {
      await api(`/admin/shipping/${editing.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: Number(form.price),
          freeThreshold: form.freeThreshold === "" ? null : Number(form.freeThreshold),
          minDays: Number(form.minDays),
          maxDays: Number(form.maxDays),
          active: form.active,
        }),
      });
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save shipping option");
    }
  }

  return (
    <div>
      {error && !open && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Methods</h2>
      </div>
      <Modal open={open} title={editing ? `Edit ${editing.code}` : "Edit shipping"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onSave(event)}>
          <label className="field">
            <span>Code</span>
            <input value={editing?.code ?? ""} readOnly />
          </label>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="dims">
            <label className="field">
              <span>Price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Free over</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.freeThreshold}
                onChange={(e) => setForm({ ...form, freeThreshold: e.target.value })}
              />
            </label>
          </div>
          <div className="dims">
            <label className="field">
              <span>Min days</span>
              <input
                type="number"
                min={0}
                value={form.minDays}
                onChange={(e) => setForm({ ...form, minDays: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Max days</span>
              <input
                type="number"
                min={0}
                value={form.maxDays}
                onChange={(e) => setForm({ ...form, maxDays: e.target.value })}
              />
            </label>
          </div>
          <label className="field choice">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
          <div className="actions">
            <button className="primary" type="submit">
              Save changes
            </button>
            <button className="ghost" type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Price</th>
              <th scope="col">Delivery</th>
              <th scope="col">Free over</th>
              <th scope="col">Active</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td className="num">{money(item.price)}</td>
                <td>
                  {item.minDays}–{item.maxDays} days
                </td>
                <td className="num">{item.freeThreshold == null ? "—" : money(item.freeThreshold)}</td>
                <td>{item.active ? "Yes" : "No"}</td>
                <td>
                  <div className="row-actions">
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

