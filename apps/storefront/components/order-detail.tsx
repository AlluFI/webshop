"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatOrderReference, formatStoreDateTime } from "@volt/shared";
import { api, readOrderToken, userErrorMessage } from "@/lib/api";
import { fulfillmentStatusKey, shippingKey } from "@/lib/i18n";
import { money } from "@/lib/product";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { RefundForm } from "./refund-form";
import { ReviewForm } from "./reviews";
import { useI18n } from "./i18n";

type Order = {
  id: string;
  reference?: string;
  status: string;
  paymentStatus: string;
  total: number;
  subtotal?: number;
  shippingCost?: number;
  tax?: number;
  taxLabel?: string;
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
  canReturn?: boolean;
  canRetry?: boolean;
  replacedByOrderId?: string | null;
  items: {
    id: string;
    name: string;
    slug: string;
    quantity: number;
    lineTotal: number;
    canReview?: boolean;
  }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
};

export function OrderDetail({ id }: { id: string }) {
  const { accessToken } = useAuth();
  const { refresh } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const { t } = useI18n();
  const [refundOpen, setRefundOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

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
          if (next.status === "PAID" || next.status === "PAYMENT_FAILED") {
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

  async function returnOrder(body: { reason: string; note?: string }) {
    if (!order) return;
    setBusy("return");
    setError("");
    try {
      const next = await api<Order>(`/orders/${order.id}/return`, {
        method: "POST",
        token: accessToken,
        orderToken: readOrderToken(order.id),
        body: JSON.stringify(body),
      });
      setOrder(next);
      setReturnOpen(false);
    } catch (err) {
      setError(userErrorMessage(err, "Could not request a return"));
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
        <h1>{t("order.title")}</h1>
        <p className="banner error">{error}</p>
        <div className="actions">
          <Link className="button" href="/cart">
            {t("order.returnCart")}
          </Link>
          <Link className="ghost" href="/orders">
            {t("order.all")}
          </Link>
        </div>
      </section>
    );
  }
  if (!order) return <p>{t("order.loading")}</p>;

  const paid = order.status === "PAID";
  const failed = order.status === "PAYMENT_FAILED";
  const cancelled = order.status === "CANCELLED";
  const refunded = order.status === "REFUNDED";
  const canRetry = failed && (order.canRetry ?? true) && !order.replacedByOrderId;
  const pickup = order.shippingMethod === "pickup";
  const title = paid
    ? t("order.paid")
    : failed
      ? t("order.failed")
      : cancelled
        ? t("order.cancelled")
        : refunded
          ? t("order.refunded")
          : t("order.waiting");

  return (
    <section>
      <p className="kicker">{t("orders.order", { ref: order.reference || formatOrderReference(order.id) })}</p>
      <h1>{title}</h1>
      {error && !refundOpen && !returnOpen && <p className="banner error">{error}</p>}
      {paid && <p className="banner ok">{t("order.mailpit")}</p>}
      {failed && canRetry && <p className="banner error">{t("order.failedRetry")}</p>}
      {failed && !canRetry && (
        <p className="banner ok">
          {t("order.failedLater")}{" "}
          {order.replacedByOrderId
            ? t("order.paidReplacement", { ref: formatOrderReference(order.replacedByOrderId) })
            : t("order.laterCovers")}
        </p>
      )}
      {cancelled && <p className="banner ok">{t("order.cancelledBanner")}</p>}
      {refunded && <p className="banner ok">{t("order.refundedBanner")}</p>}
      <div className="panel invoice-print">
        <h2 className="print-only">{t("order.invoice")}</h2>
        <p>
          {t("order.title")}: <strong>{order.reference || formatOrderReference(order.id)}</strong>
        </p>
        <p>
          {t("order.statusLabel")} <strong>{t(fulfillmentStatusKey(order.status, order.shippingMethod))}</strong>
        </p>
        <p>
          {t("order.payment")} {order.paymentStatus.replaceAll("_", " ")}
        </p>
        <p>
          {order.displayName} · {order.email}
          {order.phone ? ` · ${order.phone}` : ""}
        </p>
        {pickup ? (
          <>
            <p>
              {t("order.collectFrom")} {t("order.pickupPlace")}
              {" · "}
              {t(shippingKey("pickup"))}
              {order.estimatedDelivery ? ` · ${t("order.pickupReady", { label: order.estimatedDelivery.label })}` : ""}
            </p>
            <p className="muted">{t("order.pickupHint")}</p>
            {order.shipping && (
              <p className="muted">
                {t("order.collector")} {order.shipping.recipientName}
                {" · "}
                {t("order.contactAddress")}{" "}
                {[
                  order.shipping.line1,
                  order.shipping.line2,
                  `${order.shipping.postal} ${order.shipping.city}`.trim(),
                  order.shipping.region,
                  order.shipping.countryName || order.shipping.country,
                ]
                  .filter((line) => line && String(line).trim())
                  .join(", ")}
              </p>
            )}
          </>
        ) : (
          order.shipping && (
            <p className="muted">
              {t("order.shipTo")} {order.shipping.recipientName}, {order.shipping.line1}
              {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}, {order.shipping.postal}{" "}
              {order.shipping.city}
              {order.shipping.region ? `, ${order.shipping.region}` : ""},{" "}
              {order.shipping.countryName || order.shipping.country}
              {" · "}
              {t(shippingKey(order.shippingMethod))}
              {order.estimatedDelivery ? ` · ${t("order.est", { label: order.estimatedDelivery.label })}` : ""}
            </p>
          )
        )}
        {order.tracking && !pickup && (
          <p>
            {t("order.tracking")} {order.tracking.carrierName} <strong>{order.tracking.code}</strong>
            {" · "}
            <a href={order.tracking.url} target="_blank" rel="noreferrer">
              {t("order.trackWith", { name: order.tracking.carrierName })}
            </a>
          </p>
        )}
        <ul className="summary-list">
          {order.items.map((item) => (
            <li key={item.id}>
              <Link href={`/products/${item.slug}`}>{item.name}</Link>
              <span>
                ×{item.quantity} · {money(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        {accessToken && order.items.some((item) => item.canReview) && (
          <div className="no-print" style={{ marginTop: 16 }}>
            {order.items
              .filter((item) => item.canReview)
              .map((item) => (
                <ReviewForm
                  key={item.id}
                  slug={item.slug}
                  heading={t("order.review", { name: item.name })}
                  token={accessToken}
                  onPublished={() =>
                    setOrder((current) =>
                      current
                        ? {
                            ...current,
                            items: current.items.map((row) =>
                              row.id === item.id ? { ...row, canReview: false } : row,
                            ),
                          }
                        : current,
                    )
                  }
                />
              ))}
          </div>
        )}
        {order.subtotal != null && <p>{t("order.subtotal", { amount: money(order.subtotal) })}</p>}
        {order.shippingCost != null && (
          <p>{t(pickup ? "order.pickupFee" : "order.shipping", { amount: money(order.shippingCost) })}</p>
        )}
        {order.tax != null && (
          <p>
            {t("checkout.vat")} {money(order.tax)}
          </p>
        )}
        <p className="price">{t("checkout.total", { amount: money(order.total) })}</p>
        <div className="actions no-print">
          <button className="ghost" type="button" onClick={() => window.print()}>
            {t("order.printInvoice")}
          </button>
          {order.canCancel && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => void cancelOrder()}>
              {busy === "cancel" ? t("order.cancelling") : t("order.cancel")}
            </button>
          )}
          {order.canRefund && !refundOpen && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => setRefundOpen(true)}>
              {t("order.requestRefund")}
            </button>
          )}
          {order.canReturn && !returnOpen && (
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => setReturnOpen(true)}>
              {t("order.return")}
            </button>
          )}
        </div>
        {order.canRefund && refundOpen && (
          <div className="panel no-print" style={{ marginTop: 16 }}>
            <h2 className="kicker">{t("order.refundTitle")}</h2>
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
        {order.canReturn && returnOpen && (
          <div className="panel no-print" style={{ marginTop: 16 }}>
            <h2 className="kicker">{t("order.returnTitle")}</h2>
            <RefundForm
              mode="return"
              busy={busy === "return"}
              error={error}
              onCancel={() => {
                setReturnOpen(false);
                setError("");
              }}
              onSubmit={(body) => void returnOrder(body)}
            />
          </div>
        )}
      </div>
      <h2 className="kicker" style={{ marginTop: 24 }}>
        {t("order.statusUpdates")}
      </h2>
      <ol className="muted" style={{ marginTop: 8 }}>
        {order.events.map((event) => (
          <li key={event.id}>
            {formatStoreDateTime(event.createdAt)} — {t(fulfillmentStatusKey(event.status, order.shippingMethod))}
            {event.note ? ` · ${event.note}` : ""}
          </li>
        ))}
      </ol>
      <div className="actions" style={{ marginTop: 24 }}>
        {canRetry ? (
          <Link className="button" href="/cart">
            {t("order.returnCart")}
          </Link>
        ) : failed && order.replacedByOrderId ? (
          <Link className="button" href={`/orders/${order.replacedByOrderId}`}>
            {t("order.viewPaid")}
          </Link>
        ) : (
          <Link className="button" href="/catalog">
            {t("order.continue")}
          </Link>
        )}
        <Link className="ghost" href="/orders">
          {t("order.all")}
        </Link>
      </div>
    </section>
  );
}
