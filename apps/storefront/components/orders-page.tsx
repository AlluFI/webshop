"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ORDER_STATUSES, formatOrderReference, formatOrderStatus, formatStoreDateTime } from "@volt/shared";
import { api, userErrorMessage } from "@/lib/api";
import { money } from "@/lib/product";
import { useAuth } from "./auth";

type OrderRow = {
  id: string;
  reference?: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  itemCount: number;
  summary: string;
  thumbnail: string | null;
};

export function OrdersPage() {
  const { accessToken, user, ready } = useAuth();
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  async function load(event?: FormEvent) {
    event?.preventDefault();
    if (!accessToken) return;
    setError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const result = await api<{ items: OrderRow[]; total: number }>(`/orders?${params.toString()}`, {
        token: accessToken,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(userErrorMessage(err, "Could not load orders"));
    }
  }

  useEffect(() => {
    if (accessToken) void load();
  }, [accessToken]);

  if (!ready) return <p>Loading…</p>;
  if (!user) {
    return (
      <section>
        <h1>Orders</h1>
        <p>
          <Link href="/login">Sign in</Link> to see your order history. Guest checkouts stay on the
          confirmation link from email.
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="kicker">Account</p>
      <h1>Orders</h1>
      {error && <p className="banner error">{error}</p>}
      <form className="order-toolbar" onSubmit={(event) => void load(event)}>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {formatOrderStatus(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="ghost" type="submit">
          Filter
        </button>
      </form>
      <p className="muted">
        {total} {total === 1 ? "order" : "orders"}
      </p>
      {items.length === 0 ? (
        <p>
          No orders match these filters. <Link href="/catalog">Browse the catalog</Link>
        </p>
      ) : (
        <div className="panel cart-list">
          {items.map((order) => (
            <article key={order.id} className="cart-row">
              {order.thumbnail ? <img src={order.thumbnail} alt="" /> : <div />}
              <div>
                <Link href={`/orders/${order.id}`}>
                  <strong>Order {order.reference || formatOrderReference(order.id)}</strong>
                </Link>
                <p className="muted">
                  {formatStoreDateTime(order.createdAt)} · {order.summary}
                </p>
                <p>
                  {formatOrderStatus(order.status)} · {order.itemCount}{" "}
                  {order.itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              <p className="price">{money(order.total)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
