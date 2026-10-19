import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { can, isStaffRole, type AdminPermission } from "@volt/shared";
import { useAuth } from "../auth";
import { PageMeta } from "../seo";
import { BulkPanel } from "./admin/BulkPanel";
import { CategoriesPanel } from "./admin/CategoriesPanel";
import { LogPanel } from "./admin/LogPanel";
import { OrdersPanel } from "./admin/OrdersPanel";
import { PickingPanel } from "./admin/PickingPanel";
import { ProductsPanel } from "./admin/ProductsPanel";
import { ReviewsPanel } from "./admin/ReviewsPanel";
import { CustomersPanel } from "./admin/CustomersPanel";
import { CustomerDirectoryPanel } from "./admin/CustomerDirectoryPanel";
import { OverviewPanel } from "./admin/OverviewPanel";
import { SalesPanel } from "./admin/SalesPanel";
import { PackagesPanel } from "./admin/PackagesPanel";
import { ShippingPanel } from "./admin/ShippingPanel";
import { UsersPanel } from "./admin/UsersPanel";
import { IntegrationsPanel } from "./admin/IntegrationsPanel";
import { WholesalersPanel } from "./admin/WholesalersPanel";

type Tab =
  | "products"
  | "categories"
  | "orders"
  | "overview"
  | "sales"
  | "customers"
  | "customer-sales"
  | "picking"
  | "wholesalers"
  | "users"
  | "reviews"
  | "shipping"
  | "packages"
  | "bulk"
  | "log"
  | "integrations";

type GroupId = "product" | "orders" | "reports" | "shipping" | "admin";

const TABS: { id: Tab; permission: AdminPermission; label: string }[] = [
  { id: "products", permission: "products", label: "Products" },
  { id: "categories", permission: "catalog", label: "Categories" },
  { id: "wholesalers", permission: "catalog", label: "Wholesalers" },
  { id: "shipping", permission: "shipping", label: "Methods" },
  { id: "packages", permission: "packages", label: "Packages" },
  { id: "orders", permission: "orders", label: "Orders" },
  { id: "picking", permission: "picking", label: "Order handling" },
  { id: "overview", permission: "sales", label: "Overview" },
  { id: "sales", permission: "sales", label: "Sales" },
  { id: "customer-sales", permission: "sales", label: "Customer sales" },
  { id: "users", permission: "users", label: "Users" },
  { id: "customers", permission: "customers", label: "Customers" },
  { id: "reviews", permission: "reviews", label: "Reviews" },
  { id: "bulk", permission: "catalog", label: "Bulk" },
  { id: "log", permission: "audit", label: "Log" },
  { id: "integrations", permission: "integrations", label: "Integrations" },
];

const GROUPS: { id: GroupId; label: string; tabs: Tab[] }[] = [
  { id: "product", label: "Product", tabs: ["products", "categories", "wholesalers"] },
  { id: "orders", label: "Orders", tabs: ["orders", "picking"] },
  { id: "reports", label: "Reports", tabs: ["overview", "sales", "customer-sales"] },
  { id: "shipping", label: "Shipping", tabs: ["shipping", "packages"] },
  { id: "admin", label: "Admin", tabs: ["users", "customers", "reviews", "bulk", "log", "integrations"] },
];

const TAB_BY_ID = new Map(TABS.map((item) => [item.id, item]));

export function AdminPage() {
  const { user, accessToken, ready } = useAuth();
  const [tab, setTab] = useState<Tab | null>(null);
  const [openGroups, setOpenGroups] = useState<GroupId[]>([]);

  const visibleByGroup = useMemo(() => {
    if (!user) return [];
    return GROUPS.map((group) => ({
      ...group,
      items: group.tabs
        .map((id) => TAB_BY_ID.get(id))
        .filter((item): item is (typeof TABS)[number] => Boolean(item && can(user.role, item.permission))),
    })).filter((group) => group.items.length > 0);
  }, [user]);

  const visibleTabs = useMemo(() => visibleByGroup.flatMap((group) => group.items), [visibleByGroup]);

  useEffect(() => {
    if (tab && visibleTabs.length && !visibleTabs.some((item) => item.id === tab)) {
      setTab(null);
    }
  }, [visibleTabs, tab]);

  function toggleGroup(group: (typeof visibleByGroup)[number]) {
    const open = openGroups.includes(group.id);
    setOpenGroups((current) =>
      open ? current.filter((id) => id !== group.id) : [...current, group.id],
    );
    if (!open && group.items.length === 1) setTab(group.items[0].id);
  }

  function selectTab(groupId: GroupId, next: Tab) {
    setTab(next);
    setOpenGroups((current) => (current.includes(groupId) ? current : [...current, groupId]));
  }

  if (!ready) return <p>Loading…</p>;
  if (!user || !accessToken || !isStaffRole(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section>
      <PageMeta
        title="Admin — Volt & Co"
        description="Staff tools for catalog, wholesalers, orders, reports, users, reviews, shipping, integrations, and the change log at Volt & Co."
      />
      <p className="kicker">Staff · {user.role}</p>
      <h1>Admin</h1>
      <div className="admin-shell">
        <nav className="admin-tree" aria-label="Admin sections">
          <ul className="admin-tree-list" role="tree">
            {visibleByGroup.map((group) => {
              const open = openGroups.includes(group.id);
              const current = group.items.some((item) => item.id === tab);
              return (
                <li key={group.id} role="treeitem" aria-expanded={open} aria-selected={current && !open}>
                  <button
                    type="button"
                    className={`admin-tree-toggle${current ? " is-current" : ""}`}
                    aria-expanded={open}
                    onClick={() => toggleGroup(group)}
                  >
                    <span>{group.label}</span>
                    <span className="admin-tree-chevron" aria-hidden="true">
                      {open ? "▾" : "▸"}
                    </span>
                  </button>
                  {open ? (
                    <ul className="admin-tree-children" role="group">
                      {group.items.map((item) => (
                        <li key={item.id} role="treeitem" aria-selected={tab === item.id}>
                          <button
                            type="button"
                            className={`admin-tree-leaf${tab === item.id ? " is-active" : ""}`}
                            onClick={() => selectTab(group.id, item.id)}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="admin-view">
          {!tab && <p className="muted">Choose a section in the tree.</p>}
          {tab === "products" && <ProductsPanel token={accessToken} />}
          {tab === "categories" && <CategoriesPanel token={accessToken} />}
          {tab === "orders" && <OrdersPanel token={accessToken} canRefund={can(user.role, "refunds")} />}
          {tab === "overview" && <OverviewPanel token={accessToken} />}
          {tab === "sales" && <SalesPanel token={accessToken} />}
          {tab === "customer-sales" && <CustomersPanel token={accessToken} />}
          {tab === "customers" && <CustomerDirectoryPanel token={accessToken} />}
          {tab === "picking" && <PickingPanel token={accessToken} />}
          {tab === "wholesalers" && <WholesalersPanel token={accessToken} />}
          {tab === "users" && <UsersPanel token={accessToken} />}
          {tab === "reviews" && <ReviewsPanel token={accessToken} />}
          {tab === "shipping" && <ShippingPanel token={accessToken} />}
          {tab === "packages" && <PackagesPanel token={accessToken} />}
          {tab === "bulk" && <BulkPanel token={accessToken} />}
          {tab === "log" && <LogPanel token={accessToken} />}
          {tab === "integrations" && <IntegrationsPanel token={accessToken} />}
        </div>
      </div>
    </section>
  );
}
