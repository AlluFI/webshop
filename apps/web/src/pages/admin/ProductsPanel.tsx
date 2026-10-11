import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api";
import { money, type Product } from "../../product";
import { Modal } from "./Modal";

const emptyProduct = {
  name: "",
  description: "",
  price: "99",
  stockQuantity: "10",
  category: "accessories",
  brand: "volt",
  weightKg: "0.2",
  lengthCm: "10",
  widthCm: "10",
  heightCm: "4",
  featured: false,
};


export function ProductsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);

  async function load() {
    const data = await api<{ items: Product[] }>("/admin/products?pageSize=24", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyProduct);
  }

  function openCreate() {
    setError("");
    setEditingId(null);
    setForm(emptyProduct);
    setOpen(true);
  }

  function startEdit(item: Product) {
    setError("");
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description,
      price: String(item.price),
      stockQuantity: String(item.stockQuantity),
      category: item.category.slug,
      brand: item.brand.slug,
      weightKg: String(item.weightKg),
      lengthCm: String(item.dimensions.metric.lengthCm),
      widthCm: String(item.dimensions.metric.widthCm),
      heightCm: String(item.dimensions.metric.heightCm),
      featured: Boolean(item.featured),
    });
    setOpen(true);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body = JSON.stringify({
      ...form,
      price: Number(form.price),
      stockQuantity: Number(form.stockQuantity),
      weightKg: Number(form.weightKg),
      lengthCm: Number(form.lengthCm),
      widthCm: Number(form.widthCm),
      heightCm: Number(form.heightCm),
    });
    try {
      if (editingId) {
        await api(`/admin/products/${editingId}`, { method: "PATCH", token, body });
      } else {
        await api("/admin/products", { method: "POST", token, body });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save product");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this product?")) return;
    setError("");
    try {
      await api(`/admin/products/${id}`, { method: "DELETE", token });
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete product");
    }
  }

  async function onImage(productId: string, file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("altText", file.name);
    await api(`/admin/products/${productId}/images`, { method: "POST", token, body });
    await load();
  }

  return (
    <div>
      {error && !open && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Products</h2>
        <button className="primary" type="button" onClick={openCreate}>
          Add product
        </button>
      </div>
      <Modal open={open} title={editingId ? "Edit product" : "New product"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onSave(event)}>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </label>
          <div className="dims">
            <label className="field">
              <span>Price</span>
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label className="field">
              <span>Stock</span>
              <input
                value={form.stockQuantity}
                onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              />
            </label>
          </div>
          <div className="dims">
            <label className="field">
              <span>Category slug</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label className="field">
              <span>Brand</span>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </label>
          </div>
          <label className="field choice">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Featured
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
              <th scope="col">Product</th>
              <th scope="col">Price</th>
              <th scope="col">Stock</th>
              <th scope="col">Category</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/products/${item.slug}`}>{item.name}</Link>
                </td>
                <td className="num">{money(item.price)}</td>
                <td className="num">{item.stockQuantity}</td>
                <td>{item.category.name}</td>
                <td>
                  <div className="row-actions">
                    <button className="link" type="button" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button className="link" type="button" onClick={() => void onDelete(item.id)}>
                      Delete
                    </button>
                    <label className="file-label">
                      <span className="skip">Upload image for {item.name}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void onImage(item.id, e.target.files?.[0] ?? null)}
                      />
                    </label>
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

