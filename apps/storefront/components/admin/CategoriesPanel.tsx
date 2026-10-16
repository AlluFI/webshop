import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Modal } from "./Modal";

export function CategoriesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<{ id: string; name: string; slug: string; description: string | null }[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ items: typeof items }>("/categories", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setName("");
    setDescription("");
  }

  function openCreate() {
    setError("");
    setEditingId(null);
    setName("");
    setDescription("");
    setOpen(true);
  }

  function startEdit(item: (typeof items)[number]) {
    setError("");
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description || "");
    setOpen(true);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body = JSON.stringify({ name, description });
    try {
      if (editingId) {
        await api(`/admin/categories/${editingId}`, { method: "PATCH", token, body });
      } else {
        await api("/admin/categories", { method: "POST", token, body });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save category");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this category?")) return;
    setError("");
    try {
      await api(`/admin/categories/${id}`, { method: "DELETE", token });
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete category");
    }
  }

  return (
    <div>
      {error && !open && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Categories</h2>
        <button className="primary" type="button" onClick={openCreate}>
          Add category
        </button>
      </div>
      <Modal open={open} title={editingId ? "Edit category" : "New category"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onSave(event)}>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="actions">
            <button className="primary" type="submit">
              {editingId ? "Save changes" : "Create"}
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
              <th scope="col">Name</th>
              <th scope="col">Slug</th>
              <th scope="col">Description</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.slug}</td>
                <td>{item.description || "—"}</td>
                <td>
                  <div className="row-actions">
                    <button className="link" type="button" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button className="link" type="button" onClick={() => void onDelete(item.id)}>
                      Delete
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

