import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, userErrorMessage, readOrderToken } from "../api";
import { useAuth } from "../auth";
import { money } from "../product";

type Order = {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  shippingMethod: string;
  email: string;
  displayName: string;
  phone: string;
  shipping: {
    recipientName: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postal: string;
    country: string;
    countryName?: string;
  } | null;
  canCancel: boolean;
  canRefund: boolean;
  items: { id: string; name: string; slug: string; quantity: number; lineTotal: number }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
};

export function OrderConfirmationPage() {
  const { id = "" } = useParams();
  const { accessToken } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    const token = readOrderToken(id);
    async function load(syncFirst: boolean) {
      try {
        if (syncFirst) {
          await api<Order>(`/checkout/orders/${id}/sync`, {
            method: "POST",
            token: accessToken,
            orderToken: token,
          }).catch(() => undefined);
        }
        const next = await api<Order>(`/checkout/orders/${id}`, {
          token: accessToken,
          orderToken: token,
        });
        if (!cancelled) {
          setOrder(next);
          setError("");
        }
        return next;
      } catch (err) {
        if (!cancelled) setError(userErrorMessage(err, "Could not load this order."));
        return null;
      }
    }
    void load(true).then(async (first) => {
      if (!first || first.status !== "PENDING_PAYMENT") return;
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        if (cancelled) return;
        const next = await load(true);
        if (next && next.status !== "PENDING_PAYMENT") return;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, accessToken]);

  async function act(path: "cancel" | "refund") {
    if (!order) return;
    setBusy(path);
    setError("");
    try {
      const next = await api<Order>(`/orders/${order.id}/${path}`, {
        method: "POST",
        token: accessToken,
        orderToken: readOrderToken(order.id),
      });
      setOrder(next);
    } catch (err) {
      setError(userErrorMessage(err, "Could not update the order"));
    } finally {
      setBusy("");
    }
  }

  if (error && !order) {
    return (
      <section>
        <h1>Order</h1>
        <p className="banner error">{error}</p>
        <Link to="/checkout">Back to checkout</Link>
      </section>
    );
  }
  if (!order) return <p>Loading order…</p>;

  const paid = order.status === "PAID";
  const failed = order.status === "PAYMENT_FAILED";
  const cancelled = order.status === "CANCELLED";
  const refunded = order.status === "REFUNDED";
  const title = paid
    ? "Payment received"
    : failed
      ? "Payment did not go through"
      : cancelled
        ? "Order cancelled"
        : refunded
          ? "Order refunded"
          : "Waiting for payment";

  return (
    <section>
      <p className="kicker">Order {order.id.slice(0, 8)}</p>
      <h1>{title}</h1>
      {error && <p className="banner error">{error}</p>}
      {paid && <p className="banner ok">A confirmation email is on the way (check Mailpit).</p>}
      {failed && (
        <p className="banner error">
          Nothing was charged. Items were returned to your cart so you can try another card.
        </p>
      )}
      {cancelled && <p className="banner ok">Stock was returned. Nothing was charged.</p>}
      {refunded && <p className="banner ok">Stripe issued a sandbox refund and stock was restored.</p>}
      <div className="panel">
        <p>
          Status: <strong>{order.status.replaceAll("_", " ")}</strong>
        </p>
        <p>Payment: {order.paymentStatus.replaceAll("_", " ")}</p>
        <p>
          {order.displayName} · {order.email}
          {order.phone ? ` · ${order.phone}` : ""}
        </p>
        {order.shipping && (
          <p className="muted">
            Ship to {order.shipping.recipientName}, {order.shipping.line1}
            {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}, {order.shipping.postal}{" "}
            {order.shipping.city}
            {order.shipping.region ? `, ${order.shipping.region}` : ""},{" "}
            {order.shipping.countryName || order.shipping.country}
            {" · "}
            {order.shippingMethod}
          </p>
        )}
        <ul className="summary-list">
          {order.items.map((item) => (
            <li key={item.id}>
              <Link to={`/products/${item.slug}`}>{item.name}</Link>
              <span>
                ×{item.quantity} · {money(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <p className="price">Total {money(order.total)}</p>
        <div className="actions">
          {order.canCancel && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("cancel")}>
              {busy === "cancel" ? "Cancelling…" : "Cancel order"}
            </button>
          )}
          {order.canRefund && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("refund")}>
              {busy === "refund" ? "Refunding…" : "Request refund"}
            </button>
          )}
        </div>
      </div>
      <h2 className="kicker" style={{ marginTop: 24 }}>
        Status updates
      </h2>
      <ol className="muted" style={{ marginTop: 8 }}>
        {order.events.map((event) => (
          <li key={event.id}>
            {new Date(event.createdAt).toLocaleString()} — {event.status.replaceAll("_", " ")}
            {event.note ? ` · ${event.note}` : ""}
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 16 }}>
        {failed ? <Link to="/checkout">Try checkout again</Link> : <Link to="/catalog">Continue shopping</Link>}
        {" · "}
        <Link to="/orders">All orders</Link>
      </p>
    </section>
  );
}
