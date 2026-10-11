import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { can, isStaffRole, type AdminPermission } from "@volt/shared";
import { useAuth } from "../auth";
import { PageMeta } from "../seo";
import { BulkPanel } from "./admin/BulkPanel";
import { CategoriesPanel } from "./admin/CategoriesPanel";
import { LogPanel } from "./admin/LogPanel";
import { OrdersPanel } from "./admin/OrdersPanel";
import { ProductsPanel } from "./admin/ProductsPanel";
import { ReviewsPanel } from "./admin/ReviewsPanel";
import { ShippingPanel } from "./admin/ShippingPanel";
import { UsersPanel } from "./admin/UsersPanel";

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
