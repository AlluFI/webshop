"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ORDER_STATUSES, formatOrderReference, formatStoreDateTime } from "@volt/shared";
import { api, userErrorMessage } from "@/lib/api";
import { fulfillmentStatusKey, statusKey } from "@/lib/i18n";
import { money } from "@/lib/product";
import { AccountNav } from "./account-nav";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";

type OrderRow = {
  id: string;
  reference?: string;
  status: string;
  shippingMethod?: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  itemCount: number;
  summary: string;
  thumbnail: string | null;
};

export function OrdersPage() {
  const { t } = useI18n();
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

  if (!ready) return <p>{t("orders.loading")}</p>;
  if (!user) {
    return (
      <section>
        <h1>{t("orders.title")}</h1>
        <p>
          {t("orders.guestLead")}{" "}
          <Link href="/orders/lookup">{t("orders.findLink")}</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <AccountNav />
      <h1>{t("orders.title")}</h1>
      {error && <p className="banner error">{error}</p>}
      <form className="order-toolbar" onSubmit={(event) => void load(event)}>
        <label>
          {t("orders.status")}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{t("common.any")}</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(statusKey(value))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("orders.from")}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          {t("orders.to")}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="ghost" type="submit">
          {t("orders.filter")}
        </button>
      </form>
      <p className="muted">
        {t(total === 1 ? "orders.countOne" : "orders.count", { n: total })}
      </p>
      {items.length === 0 ? (
        <p>
          {t("orders.empty")} <Link href="/catalog">{t("cart.browse")}</Link>
        </p>
      ) : (
        <div className="panel cart-list">
          {items.map((order) => (
            <article key={order.id} className="cart-row">
              {order.thumbnail ? <img src={order.thumbnail} alt="" /> : <div />}
              <div>
                <Link href={`/orders/${order.id}`}>
                  <strong>{t("orders.order", { ref: order.reference || formatOrderReference(order.id) })}</strong>
                </Link>
                <p className="muted">
                  {formatStoreDateTime(order.createdAt)} · {order.summary}
                </p>
                <p>
                  {t(fulfillmentStatusKey(order.status, order.shippingMethod))} · {order.itemCount}{" "}
                  {order.itemCount === 1 ? t("cart.item") : t("cart.items")}
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
