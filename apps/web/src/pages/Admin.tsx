import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { ALL_ROLES, AUDIT_ENTITIES, ORDER_STATUSES, SHIPPING_CARRIERS, SHIPPING_CARRIER_META, can, isStaffRole, type AdminPermission } from "@volt/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { PageMeta } from "../seo";
import { money, type Product } from "../product";

type Tab = "products" | "categories" | "orders" | "users" | "reviews" | "shipping" | "bulk" | "log";

const TABS: { id: Tab; permission: AdminPermission }[] = [
  { id: "products", permission: "catalog" },
  { id: "categories", permission: "catalog" },
  { id: "orders", permission: "orders" },
  { id: "users", permission: "users" },
  { id: "reviews", permission: "reviews" },
  { id: "shipping", permission: "shipping" },
  { id: "bulk", permission: "catalog" },
  { id: "log", permission: "audit" },
];

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

export function AdminPage() {
  const { user, accessToken, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("products");

  const visible = useMemo(
    () => (user ? TABS.filter((item) => can(user.role, item.permission)) : []),
    [user],
  );

  useEffect(() => {
    if (visible.length && !visible.some((item) => item.id === tab)) {
      setTab(visible[0].id);
    }
  }, [visible, tab]);

  if (!ready) return <p>Loading…</p>;
  if (!user || !accessToken || !isStaffRole(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section>
      <PageMeta
        title="Admin — Volt & Co"
        description="Staff tools for catalog, orders, users, reviews, shipping, and the change log at Volt & Co."
      />
      <p className="kicker">Staff · {user.role}</p>
      <h1>Admin</h1>
      <nav className="admin-tabs" aria-label="Admin sections">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "primary" : "ghost"}
            onClick={() => setTab(item.id)}
          >
            {item.id}
          </button>
        ))}
      </nav>
      {tab === "products" && <ProductsPanel token={accessToken} />}
      {tab === "categories" && <CategoriesPanel token={accessToken} />}
      {tab === "orders" && <OrdersPanel token={accessToken} canRefund={can(user.role, "refunds")} />}
      {tab === "users" && <UsersPanel token={accessToken} />}
      {tab === "reviews" && <ReviewsPanel token={accessToken} />}
      {tab === "shipping" && <ShippingPanel token={accessToken} />}
      {tab === "bulk" && <BulkPanel token={accessToken} />}
      {tab === "log" && <LogPanel token={accessToken} />}
    </section>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleClose = () => onCloseRef.current();
    node.addEventListener("close", handleClose);

    if (open) {
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.removeEventListener("close", handleClose);
      node.close();
    }

    return () => {
      node.removeEventListener("close", handleClose);
      if (node.open) node.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="link" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function ProductsPanel({ token }: { token: string }) {
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

function CategoriesPanel({ token }: { token: string }) {
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

function isoDatePlus(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function OrdersPanel({ token, canRefund }: { token: string; canRefund: boolean }) {
  const [items, setItems] = useState<
    {
      id: string;
      status: string;
      total: number;
      summary: string;
      createdAt: string;
      shippingMethod?: string;
      trackingCarrier?: string | null;
      trackingCode?: string | null;
      estimatedDeliveryFrom?: string | null;
      estimatedDeliveryTo?: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [shipOrder, setShipOrder] = useState<(typeof items)[number] | null>(null);
  const [form, setForm] = useState({
    carrier: "posti" as (typeof SHIPPING_CARRIERS)[number],
    trackingCode: "",
    estimatedDeliveryFrom: isoDatePlus(3),
    estimatedDeliveryTo: isoDatePlus(5),
  });

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/orders", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function openShip(item: (typeof items)[number]) {
    const express = item.shippingMethod === "express";
    setShipOrder(item);
    setForm({
      carrier: (item.trackingCarrier as (typeof SHIPPING_CARRIERS)[number]) || "posti",
      trackingCode: item.trackingCode || "",
      estimatedDeliveryFrom: item.estimatedDeliveryFrom || isoDatePlus(express ? 1 : 3),
      estimatedDeliveryTo: item.estimatedDeliveryTo || isoDatePlus(express ? 2 : 5),
    });
    setError("");
  }

  async function setStatus(id: string, status: string) {
    if (status === "SHIPPED") {
      const row = items.find((item) => item.id === id);
      if (row) openShip(row);
      return;
    }
    setError("");
    try {
      await api(`/admin/orders/${id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, note: `Staff set ${status}` }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update order");
    }
  }

  async function saveShipment(event: FormEvent) {
    event.preventDefault();
    if (!shipOrder) return;
    setError("");
    try {
      await api(`/admin/orders/${shipOrder.id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({
          status: "SHIPPED",
          carrier: form.carrier,
          trackingCode: form.trackingCode,
          estimatedDeliveryFrom: form.estimatedDeliveryFrom,
          estimatedDeliveryTo: form.estimatedDeliveryTo,
          note: `Shipped with ${SHIPPING_CARRIER_META[form.carrier].name} ${form.trackingCode}`,
        }),
      });
      setShipOrder(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save tracking");
    }
  }

  async function refund(id: string) {
    await api(`/admin/orders/${id}/refund`, { method: "POST", token });
    await load();
  }

  return (
    <div>
      {error && !shipOrder && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Orders</h2>
      </div>
      <Modal
        open={Boolean(shipOrder)}
        title={shipOrder?.status === "SHIPPED" ? "Update tracking" : "Ship order"}
        onClose={() => setShipOrder(null)}
      >
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void saveShipment(event)}>
          <label className="field">
            <span>Carrier</span>
            <select
              value={form.carrier}
              onChange={(e) =>
                setForm({ ...form, carrier: e.target.value as (typeof SHIPPING_CARRIERS)[number] })
              }
            >
              {SHIPPING_CARRIERS.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {SHIPPING_CARRIER_META[carrier].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tracking number</span>
            <input
              value={form.trackingCode}
              onChange={(e) => setForm({ ...form, trackingCode: e.target.value })}
              placeholder={
                form.carrier === "posti"
                  ? "JJFI66012700410158170/32109367922"
                  : form.carrier === "postnord"
                    ? "00TEST123456789SE"
                    : "BUD-DEV-12345"
              }
              required
              autoFocus
            />
          </label>
          <div className="dims">
            <label className="field">
              <span>Delivery from</span>
              <input
                type="date"
                value={form.estimatedDeliveryFrom}
                onChange={(e) => setForm({ ...form, estimatedDeliveryFrom: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Delivery to</span>
              <input
                type="date"
                value={form.estimatedDeliveryTo}
                onChange={(e) => setForm({ ...form, estimatedDeliveryTo: e.target.value })}
                required
              />
            </label>
          </div>
          <p className="muted">
            The customer gets a shipped email with a Volt & Co order link and a {SHIPPING_CARRIER_META[form.carrier].name}{" "}
            tracking link.
            {form.carrier === "posti"
              ? " Posti URLs look like posti.fi/en/tracking/JJFI…/3210… — paste both numbers if Posti shows two."
              : ""}
          </p>
          <div className="actions">
            <button className="primary" type="submit">
              {shipOrder?.status === "SHIPPED" ? "Save tracking" : "Mark shipped"}
            </button>
            <button className="ghost" type="button" onClick={() => setShipOrder(null)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Status</th>
              <th scope="col">Total</th>
              <th scope="col">Summary</th>
              <th scope="col">Tracking</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}</td>
                <td>{item.status}</td>
                <td className="num">{money(item.total)}</td>
                <td>{item.summary}</td>
                <td>
                  {item.trackingCode
                    ? `${SHIPPING_CARRIER_META[item.trackingCarrier as (typeof SHIPPING_CARRIERS)[number]]?.name ?? item.trackingCarrier} ${item.trackingCode}`
                    : "—"}
                </td>
                <td>
                  <div className="row-actions">
                    <select value={item.status} onChange={(e) => void setStatus(item.id, e.target.value)}>
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {["PAID", "PROCESSING", "SHIPPED"].includes(item.status) && (
                      <button className="link" type="button" onClick={() => openShip(item)}>
                        {item.status === "SHIPPED" ? "Tracking" : "Ship"}
                      </button>
                    )}
                    {canRefund && ["PAID", "PROCESSING", "SHIPPED"].includes(item.status) && (
                      <button className="link" type="button" onClick={() => void refund(item.id)}>
                        Refund
                      </button>
                    )}
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

function UsersPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    { id: string; email: string; role: string; totpEnabled: boolean }[]
  >([]);
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/users", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  async function assign(id: string, role: string) {
    setError("");
    try {
      await api(`/admin/users/${id}/role`, { method: "POST", token, body: JSON.stringify({ role }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign role");
    }
  }

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <p className="muted">Staff roles require 2FA already enabled on the account.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">2FA</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.email}</td>
                <td>{item.totpEnabled ? "On" : "Off"}</td>
                <td>
                  <select value={item.role} onChange={(e) => void assign(item.id, e.target.value)}>
                    {ALL_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    { id: string; body: string; stars: number; status: string; product: { name: string }; author: string }[]
  >([]);

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/reviews", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [token]);

  async function moderate(id: string, status: "PUBLISHED" | "HIDDEN") {
    await api(`/admin/reviews/${id}/moderate`, { method: "POST", token, body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Stars</th>
            <th scope="col">Product</th>
            <th scope="col">Author</th>
            <th scope="col">Status</th>
            <th scope="col">Review</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.stars}★</td>
              <td>{item.product.name}</td>
              <td>{item.author}</td>
              <td>{item.status}</td>
              <td>{item.body}</td>
              <td>
                <button
                  className="link"
                  type="button"
                  onClick={() => void moderate(item.id, item.status === "HIDDEN" ? "PUBLISHED" : "HIDDEN")}
                >
                  {item.status === "HIDDEN" ? "Publish" : "Hide"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShippingPanel({ token }: { token: string }) {
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
        <h2>Shipping</h2>
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

function LogPanel({ token }: { token: string }) {
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
      <p className="muted">Staff edits to products, categories, orders, reviews, and shipping.</p>
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
                    {new Date(item.createdAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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

function BulkPanel({ token }: { token: string }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function onFile(file: File | null) {
    if (!file) return;
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const data = await api<{ created: number; errors: { row: number; error: string }[] }>(
        "/admin/products/bulk",
        { method: "POST", token, body },
      );
      setResult(`Created ${data.created}. ${data.errors.length} row errors.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  return (
    <div className="panel">
      <h2>Bulk upload</h2>
      <p className="muted">
        CSV headers: name, description, price, stockQuantity, category, brand, weightKg, lengthCm, widthCm,
        heightCm. JSON is an array of the same fields.
      </p>
      {error && <p className="banner error">{error}</p>}
      {result && <p className="banner ok">{result}</p>}
      <input
        type="file"
        accept=".csv,.json,application/json,text/csv"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
