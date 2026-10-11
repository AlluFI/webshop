import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, userErrorMessage, readOrderToken } from "../api";
import { useAuth } from "../auth";
import { useCart } from "../cart";
import { formatStoreDateTime } from "@volt/shared";
import { money } from "../product";
import { RefundForm } from "../RefundForm";
import { PageMeta } from "../seo";

type Order = {
  id: string;
  reference?: string;
  status: string;
  paymentStatus: string;
  total: number;
  shippingMethod: string;
  estimatedDelivery?: { from: string; to: string; label: string } | null;
  tracking?: { carrier: string; carrierName: string; code: string; url: string } | null;
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
  canRetry?: boolean;
  replacedByOrderId?: string | null;
  items: { id: string; name: string; slug: string; quantity: number; lineTotal: number }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
};

export function OrderConfirmationPage() {
  const { id = "" } = useParams();
  const { accessToken } = useAuth();
  const { refresh } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

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
          if (next.status === "PAYMENT_FAILED") {
            void refresh().catch(() => undefined);
          }
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
  }, [id, accessToken, refresh]);

  async function cancelOrder() {
    if (!order) return;
    setBusy("cancel");
    setError("");
    try {
      const next = await api<Order>(`/orders/${order.id}/cancel`, {
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

  async function refundOrder(body: { reason: string; note?: string }) {
    if (!order) return;
    setBusy("refund");
    setError("");
    try {
      const next = await api<Order>(`/orders/${order.id}/refund`, {
        method: "POST",
        token: accessToken,
        orderToken: readOrderToken(order.id),
        body: JSON.stringify(body),
      });
      setOrder(next);
      setRefundOpen(false);
    } catch (err) {
      setError(userErrorMessage(err, "Could not refund this order"));
    } finally {
      setBusy("");
    }
  }

  if (error && !order) {
    return (
      <section>
        <h1>Order</h1>
        <p className="banner error">{error}</p>
        <div className="actions">
          <Link className="button" to="/cart">
            Return to cart
          </Link>
          <Link className="ghost" to="/orders">
            All orders
          </Link>
        </div>
      </section>
    );
  }
  if (!order) return <p>Loading order…</p>;

  const paid = order.status === "PAID";
  const failed = order.status === "PAYMENT_FAILED";
  const cancelled = order.status === "CANCELLED";
  const refunded = order.status === "REFUNDED";
  const canRetry = failed && (order.canRetry ?? true) && !order.replacedByOrderId;
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
      <PageMeta
        title="Order confirmation — Volt & Co"
        description="Your Volt & Co order summary, reference number, estimated delivery, and shipping details after checkout."
      />
      <p className="kicker">Order {order.reference || order.id.slice(0, 8)}</p>
      <h1>{title}</h1>
      {error && !refundOpen && <p className="banner error">{error}</p>}
      {paid && <p className="banner ok">A confirmation email is on the way (check Mailpit).</p>}
      {failed && canRetry && (
        <p className="banner error">
          Nothing was charged. Your items are back in the cart so you can try another card. A
          failure email is on the way (check Mailpit).
        </p>
      )}
      {failed && !canRetry && (
        <p className="banner ok">
          Nothing was charged on this attempt.
          {order.replacedByOrderId
            ? ` You later paid for these items in order ${order.replacedByOrderId.slice(0, 8)}.`
            : " A later order already covers these items."}
        </p>
      )}
      {cancelled && <p className="banner ok">Stock was returned. Nothing was charged.</p>}
      {refunded && <p className="banner ok">Stripe issued a sandbox refund and stock was restored.</p>}
      <div className="panel">
        <p>
          Order ID: <strong>{order.id}</strong>
        </p>
        <p>
          Reference: <strong>{order.reference || order.id.slice(0, 8)}</strong>
        </p>
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
            {order.estimatedDelivery ? ` · Est. delivery ${order.estimatedDelivery.label}` : ""}
          </p>
        )}
        {order.tracking && (
          <p>
            Tracking: {order.tracking.carrierName} <strong>{order.tracking.code}</strong>
            {" · "}
            <a href={order.tracking.url} target="_blank" rel="noreferrer">
              Track with {order.tracking.carrierName}
            </a>
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
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => void cancelOrder()}>
              {busy === "cancel" ? "Cancelling…" : "Cancel order"}
            </button>
          )}
          {order.canRefund && !refundOpen && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => setRefundOpen(true)}>
              Request refund
            </button>
          )}
        </div>
        {order.canRefund && refundOpen && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2 className="kicker">Refund this order</h2>
            <RefundForm
              busy={busy === "refund"}
              error={error}
              onCancel={() => {
                setRefundOpen(false);
                setError("");
              }}
              onSubmit={(body) => void refundOrder(body)}
            />
          </div>
        )}
      </div>
      <h2 className="kicker" style={{ marginTop: 24 }}>
        Status updates
      </h2>
      <ol className="muted" style={{ marginTop: 8 }}>
        {order.events.map((event) => (
          <li key={event.id}>
            {formatStoreDateTime(event.createdAt)} — {event.status.replaceAll("_", " ")}
            {event.note ? ` · ${event.note}` : ""}
          </li>
        ))}
      </ol>
      <div className="actions" style={{ marginTop: 24 }}>
        {canRetry ? (
          <Link className="button" to="/cart">
            Return to cart
          </Link>
        ) : failed && order.replacedByOrderId ? (
          <Link className="button" to={`/orders/${order.replacedByOrderId}`}>
            View paid order
          </Link>
        ) : (
          <Link className="button" to="/catalog">
            Continue shopping
          </Link>
        )}
        <Link className="ghost" to="/orders">
          All orders
        </Link>
      </div>
    </section>
  );
}
