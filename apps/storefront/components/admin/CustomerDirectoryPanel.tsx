import { useEffect, useState } from "react";
import { formatOrderStatus, formatStoreDateTime } from "@volt/shared";
import { api } from "@/lib/api";
import { money } from "@/lib/product";
import { Modal } from "./Modal";

type CustomerRow = {
  id: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  marketingOptIn: boolean;
  retainUntil: string | null;
};

type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type CustomerOrder = {
  id: string;
  reference: string;
  status: string;
  hasDeviation: boolean;
  total: number;
  currency: string;
  createdAt: string;
  items: OrderLine[];
};

type CustomerDetail = CustomerRow & {
  status: "active" | "deleted";
  phone: string | null;
  addresses: {
    id: string;
    label?: string | null;
    recipientName: string;
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postal: string;
    country: string;
    phone?: string | null;
    isDefault?: boolean;
  }[];
  orders: CustomerOrder[];
};

export function CustomerDirectoryPanel({ token }: { token: string }) {
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  async function load() {
    const data = await api<{ items: CustomerRow[] }>("/admin/customers?pageSize=50", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  async function openCustomer(id: string) {
    setError("");
    setOpenOrderId(null);
    try {
      setDetail(await api<CustomerDetail>(`/admin/customers/${id}`, { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customer");
    }
  }

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Customers</h2>
      </div>
      <p className="muted">Shopper accounts. Click a name for addresses, consent, and orders.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Created</th>
              <th scope="col">Last edited</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4}>No customers yet.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="link" type="button" onClick={() => void openCustomer(item.id)}>
                      {item.displayName || "—"}
                    </button>
                  </td>
                  <td>{item.email || "—"}</td>
                  <td>{formatStoreDateTime(item.createdAt)}</td>
                  <td>{formatStoreDateTime(item.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Modal
        wide
        open={Boolean(detail)}
        title={detail?.displayName || "Customer"}
        onClose={() => {
          setDetail(null);
          setOpenOrderId(null);
        }}
      >
        {detail && (
          <div className="customer-detail">
            <div className="customer-detail-facts">
              <p>
                <span className="kicker">Email</span>
                <span>{detail.email || "—"}</span>
              </p>
              <p>
                <span className="kicker">Phone</span>
                <span>{detail.phone || "—"}</span>
              </p>
              <p>
                <span className="kicker">Marketing</span>
                <span>{detail.marketingOptIn ? "Opted in" : "Opted out"}</span>
              </p>
              <p>
                <span className="kicker">Account</span>
                <span>{detail.status === "deleted" ? "Deleted" : "Active"}</span>
              </p>
              {detail.retainUntil ? (
                <p>
                  <span className="kicker">Retain until</span>
                  <span>{formatStoreDateTime(detail.retainUntil)}</span>
                </p>
              ) : null}
            </div>
            <div className="customer-detail-section">
              <span className="kicker">Addresses</span>
              {detail.addresses.length === 0 ? (
                <p className="muted">No saved addresses.</p>
              ) : (
                <ul className="customer-detail-addresses">
                  {detail.addresses.map((address) => (
                    <li key={address.id} className="address-card">
                      <div>
                        <div className="address-card-head">
                          <strong>{address.label || "Address"}</strong>
                          {address.isDefault ? <span className="address-default">Default</span> : null}
                        </div>
                        <p>{address.recipientName}</p>
                        <p>{address.line1}</p>
                        {address.line2 ? <p>{address.line2}</p> : null}
                        <p>
                          {address.postal} {address.city}
                        </p>
                        {address.phone ? <p>{address.phone}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="customer-detail-section">
              <span className="kicker">Orders</span>
              {detail.orders.length === 0 ? (
                <p className="muted">No orders.</p>
              ) : (
                <ul className="customer-order-list">
                  {detail.orders.map((order) => {
                    const open = openOrderId === order.id;
                    return (
                      <li key={order.id} className="customer-order">
                        <button
                          type="button"
                          className="customer-order-toggle"
                          aria-expanded={open}
                          onClick={() => setOpenOrderId(open ? null : order.id)}
                        >
                          {order.hasDeviation ? (
                            <span className="express-flag" title="Order has a deviation">
                              <span aria-hidden="true">!</span>
                            </span>
                          ) : null}
                          <span className="locator-code">{order.reference}</span>
                          <span className="customer-order-meta">
                            {formatOrderStatus(order.status)} · {money(order.total)} ·{" "}
                            {formatStoreDateTime(order.createdAt)}
                          </span>
                        </button>
                        {open ? (
                          <ul className="customer-order-items">
                            {order.items.length === 0 ? (
                              <li className="muted">No line items.</li>
                            ) : (
                              order.items.map((item) => (
                                <li key={item.id}>
                                  {item.quantity} × {item.name} · {money(item.lineTotal)}
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
