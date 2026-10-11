import { useEffect, useMemo, useRef, useState } from "react";
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
import { SalesPanel } from "./admin/SalesPanel";
import { ShippingPanel } from "./admin/ShippingPanel";
import { UsersPanel } from "./admin/UsersPanel";
import { WholesalersPanel } from "./admin/WholesalersPanel";

type Tab =
  | "products"
  | "categories"
  | "orders"
  | "sales"
  | "picking"
  | "wholesalers"
  | "users"
  | "reviews"
  | "shipping"
  | "bulk"
  | "log";

type GroupId = "product" | "orders" | "admin";

const TABS: { id: Tab; permission: AdminPermission; label: string }[] = [
  { id: "products", permission: "products", label: "Products" },
  { id: "categories", permission: "catalog", label: "Categories" },
  { id: "wholesalers", permission: "catalog", label: "Wholesalers" },
  { id: "shipping", permission: "shipping", label: "Shipping" },
  { id: "orders", permission: "orders", label: "Orders" },
  { id: "picking", permission: "picking", label: "Picking" },
  { id: "sales", permission: "sales", label: "Sales" },
  { id: "users", permission: "users", label: "Users" },
  { id: "reviews", permission: "reviews", label: "Reviews" },
  { id: "bulk", permission: "catalog", label: "Bulk" },
  { id: "log", permission: "audit", label: "Log" },
];

const GROUPS: { id: GroupId; label: string; tabs: Tab[] }[] = [
  { id: "product", label: "Product", tabs: ["products", "categories", "wholesalers", "shipping"] },
  { id: "orders", label: "Orders", tabs: ["orders", "picking", "sales"] },
  { id: "admin", label: "Admin", tabs: ["users", "reviews", "bulk", "log"] },
];

const TAB_BY_ID = new Map(TABS.map((item) => [item.id, item]));

function groupOf(tab: Tab): GroupId {
  return GROUPS.find((group) => group.tabs.includes(tab))?.id ?? "product";
}

export function AdminPage() {
  const { user, accessToken, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("products");
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);
  const navRef = useRef<HTMLElement>(null);

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
  const activeGroup = groupOf(tab);
  const activeItems = visibleByGroup.find((group) => group.id === activeGroup)?.items ?? [];

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!ready) return <p>Loading…</p>;
  if (!user || !accessToken || !isStaffRole(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section>
      <PageMeta
        title="Admin — Volt & Co"
        description="Staff tools for catalog, wholesalers, orders, sales, users, reviews, shipping, and the change log at Volt & Co."
      />
      <p className="kicker">Staff · {user.role}</p>
      <h1>Admin</h1>
      <nav className="admin-nav" aria-label="Admin groups" ref={navRef}>
        {visibleByGroup.map((group) => {
          const open = openGroup === group.id;
          const current = activeGroup === group.id;
          return (
            <div key={group.id} className="admin-menu">
              <button
                type="button"
                className={current ? "primary" : "ghost"}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={`admin-menu-${group.id}`}
                onClick={() => {
                  if (group.items.length === 1) {
                    setTab(group.items[0].id);
                    setOpenGroup(null);
                    return;
                  }
                  setOpenGroup(open ? null : group.id);
                }}
              >
                {group.label}
                {group.items.length > 1 ? <span aria-hidden="true"> ▾</span> : null}
              </button>
              {open && group.items.length > 1 && (
                <div className="admin-menu-list" id={`admin-menu-${group.id}`} role="menu">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={tab === item.id ? "primary" : "ghost"}
                      onClick={() => {
                        setTab(item.id);
                        setOpenGroup(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {activeItems.length > 1 ? (
        <nav className="admin-subnav" aria-label={`${GROUPS.find((group) => group.id === activeGroup)?.label} sections`}>
          {activeItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "primary" : "ghost"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
      {tab === "products" && <ProductsPanel token={accessToken} />}
      {tab === "categories" && <CategoriesPanel token={accessToken} />}
      {tab === "orders" && <OrdersPanel token={accessToken} canRefund={can(user.role, "refunds")} />}
      {tab === "sales" && <SalesPanel token={accessToken} />}
      {tab === "picking" && <PickingPanel token={accessToken} />}
      {tab === "wholesalers" && <WholesalersPanel token={accessToken} />}
      {tab === "users" && <UsersPanel token={accessToken} />}
      {tab === "reviews" && <ReviewsPanel token={accessToken} />}
      {tab === "shipping" && <ShippingPanel token={accessToken} />}
      {tab === "bulk" && <BulkPanel token={accessToken} />}
      {tab === "log" && <LogPanel token={accessToken} />}
    </section>
  );
}
