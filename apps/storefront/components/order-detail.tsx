"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FINLAND_VAT_RATE,
  formatOrderReference,
  formatStoreDate,
  formatStoreDateTime,
  warehouseAddressLines,
} from "@volt/shared";
import { api, readOrderToken, userErrorMessage } from "@/lib/api";
import { fulfillmentStatusKey, shippingKey, type MessageKey } from "@/lib/i18n";
import { money } from "@/lib/product";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { RefundForm } from "./refund-form";
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
  createdAt?: string;
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
    unitPrice?: number;
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
      <div className="no-print">
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
      <div className="panel">
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
              <div>
                <Link href={`/products/${item.slug}`}>{item.name}</Link>
                {accessToken && item.canReview && (
                  <Link
                    className="review-link no-print"
                    href={`/reviews?product=${encodeURIComponent(item.slug)}&order=${encodeURIComponent(order.id)}`}
                  >
                    {t("review.write")}
                  </Link>
                )}
              </div>
              <span>
                ×{item.quantity} · {money(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
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
      </div>
      <InvoiceSheet order={order} pickup={pickup} t={t} />
    </section>
  );
}

function addressLines(shipping: Order["shipping"]) {
  if (!shipping) return [];
  return [
    shipping.recipientName,
    shipping.line1,
    shipping.line2,
    `${shipping.postal} ${shipping.city}`.trim(),
    shipping.region,
    shipping.countryName || shipping.country,
  ].filter((line) => line && String(line).trim());
}

function InvoiceSheet({
  order,
  pickup,
  t,
}: {
  order: Order;
  pickup: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const reference = order.reference || formatOrderReference(order.id);
  const paidAt = order.events.find((event) => event.status === "PAID")?.createdAt;
  const invoiceDate = paidAt || order.createdAt || order.events[0]?.createdAt;
  const paymentKey: MessageKey =
    order.status === "REFUNDED"
      ? "invoice.refunded"
      : order.status === "CANCELLED" || order.status === "PAYMENT_FAILED" || order.status === "PENDING_PAYMENT"
        ? "invoice.unpaid"
        : "invoice.paid";
  const destination = pickup ? warehouseAddressLines() : addressLines(order.shipping);

  return (
    <article className="invoice-sheet print-only" aria-hidden="true">
      <header className="invoice-head">
        <div>
          <p className="invoice-brand">
            Volt <span>&amp;</span> Co
          </p>
          <p>{t("invoice.sellerLine")}</p>
          <p>{t("invoice.sellerEmail")}</p>
        </div>
        <div className="invoice-head-meta">
          <h1>{t("order.invoice")}</h1>
        </div>
      </header>
      <dl className="invoice-meta">
        <div>
          <dt>{t("invoice.number")}</dt>
          <dd>{reference}</dd>
        </div>
        <div>
          <dt>{t("invoice.date")}</dt>
          <dd>{invoiceDate ? formatStoreDate(invoiceDate) : "—"}</dd>
        </div>
        <div>
          <dt>{t("invoice.payment")}</dt>
          <dd>{t(paymentKey)}</dd>
        </div>
        <div>
          <dt>{t("invoice.method")}</dt>
          <dd>{t(shippingKey(order.shippingMethod))}</dd>
        </div>
      </dl>
      <div className="invoice-parties">
        <section>
          <h2>{t("invoice.buyer")}</h2>
          <p>
            <strong>{order.displayName}</strong>
          </p>
          <p>
            {t("invoice.email")}: {order.email}
          </p>
          {order.phone ? (
            <p>
              {t("invoice.phone")}: {order.phone}
            </p>
          ) : null}
          {!pickup &&
            addressLines(order.shipping)
              .slice(1)
              .map((line) => <p key={line}>{line}</p>)}
        </section>
        <section>
          <h2>{t(pickup ? "invoice.collect" : "invoice.shipTo")}</h2>
          {destination.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      </div>
      <table className="invoice-table">
        <thead>
          <tr>
            <th scope="col">{t("invoice.item")}</th>
            <th className="num" scope="col">
              {t("invoice.qty")}
            </th>
            <th className="num" scope="col">
              {t("invoice.unit")}
            </th>
            <th className="num" scope="col">
              {t("invoice.vat")}
            </th>
            <th className="num" scope="col">
              {t("invoice.amount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => {
            const unit = item.unitPrice ?? item.lineTotal / Math.max(item.quantity, 1);
            return (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="num">{item.quantity}</td>
                <td className="num">{money(unit)}</td>
                <td className="num">{t("invoice.vatRate", { rate: FINLAND_VAT_RATE })}</td>
                <td className="num">{money(item.lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="invoice-totals">
        <tbody>
          {order.subtotal != null && (
            <tr>
              <th scope="row">{t("invoice.subtotal")}</th>
              <td>{money(order.subtotal)}</td>
            </tr>
          )}
          {order.shippingCost != null && (
            <tr>
              <th scope="row">{t(pickup ? "invoice.pickup" : "invoice.shipping")}</th>
              <td>{money(order.shippingCost)}</td>
            </tr>
          )}
          {order.tax != null && (
            <tr>
              <th scope="row">{t("checkout.vat")}</th>
              <td>{money(order.tax)}</td>
            </tr>
          )}
          <tr className="grand">
            <th scope="row">{t("invoice.total")}</th>
            <td>{money(order.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="invoice-stamp">{t(paymentKey)}</p>
      <p className="invoice-thanks">{t("invoice.thanks")}</p>
      <footer className="invoice-foot">
        <p>{t("invoice.vatNote", { rate: FINLAND_VAT_RATE })}</p>
        <p>
          Volt &amp; Co · {t("invoice.sellerLine")} · {t("invoice.sellerEmail")}
        </p>
      </footer>
    </article>
  );
}
