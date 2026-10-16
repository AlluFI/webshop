import { Fragment, useEffect, useState, type FormEvent } from "react";
import {
  addStoreDays,
  formatOrderReference,
  formatOrderStatus,
  formatStoreDateTime,
  ORDER_STATUSES,
  SHIPPING_CARRIERS,
  SHIPPING_CARRIER_META,
  STAFF_REFUNDABLE_STATUSES,
  storeCalendarDate,
} from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/product";
import { RefundForm } from "@/components/refund-form";
import { Modal } from "./Modal";

function isoDatePlus(days: number) {
  return storeCalendarDate(addStoreDays(new Date(), days));
}

function summaryLines(summary: string) {
  return summary
    .split(", ")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function OrdersPanel({ token, canRefund }: { token: string; canRefund: boolean }) {
  const [items, setItems] = useState<
    {
      id: string;
      reference?: string;
      status: string;
      total: number;
      summary: string;
      customerName?: string;
      email?: string;
      createdAt: string;
      paidAt?: string | null;
      shippingMethod?: string;
      trackingCarrier?: string | null;
      trackingCode?: string | null;
      estimatedDeliveryFrom?: string | null;
      estimatedDeliveryTo?: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [shipOrder, setShipOrder] = useState<(typeof items)[number] | null>(null);
  const [refundOrder, setRefundOrder] = useState<(typeof items)[number] | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [form, setForm] = useState({
    carrier: "posti" as (typeof SHIPPING_CARRIERS)[number],
    trackingCode: "",
    estimatedDeliveryFrom: isoDatePlus(3),
    estimatedDeliveryTo: isoDatePlus(5),
  });

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/orders", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function toggleRow(id: string) {
    setOpenRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );
  }

  function openShip(item: (typeof items)[number]) {
    const express = item.shippingMethod === "express";
    setShipOrder(item);
    setForm({
      carrier: (item.trackingCarrier as (typeof SHIPPING_CARRIERS)[number]) || "posti",
      trackingCode: item.trackingCode || "",
      estimatedDeliveryFrom: item.estimatedDeliveryFrom || isoDatePlus(express ? 1 : 3),
      estimatedDeliveryTo: item.estimatedDeliveryTo || isoDatePlus(express ? 2 : 5),
    });
    setError("");
  }

  async function setStatus(id: string, status: string) {
    if (status === "WITH_COURIER") {
      const row = items.find((item) => item.id === id);
      if (row) openShip(row);
      return;
    }
    setError("");
    try {
      await api(`/admin/orders/${id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, note: `Staff set ${status}` }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update order");
    }
  }

  async function saveShipment(event: FormEvent) {
    event.preventDefault();
    if (!shipOrder) return;
    setError("");
    try {
      await api(`/admin/orders/${shipOrder.id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({
          status: "WITH_COURIER",
          carrier: form.carrier,
          trackingCode: form.trackingCode,
          estimatedDeliveryFrom: form.estimatedDeliveryFrom,
          estimatedDeliveryTo: form.estimatedDeliveryTo,
          note: `Shipped with ${SHIPPING_CARRIER_META[form.carrier].name} ${form.trackingCode}`,
        }),
      });
      setShipOrder(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save tracking");
    }
  }

  async function refund(body: { reason: string; note?: string }) {
    if (!refundOrder) return;
    setRefundBusy(true);
    setError("");
    try {
      await api(`/admin/orders/${refundOrder.id}/refund`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      });
      setRefundOrder(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refund this order");
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <div>
      {error && !shipOrder && !refundOrder && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Orders</h2>
      </div>
      <Modal
        open={Boolean(refundOrder)}
        title={refundOrder ? `Refund ${refundOrder.reference || formatOrderReference(refundOrder.id)}` : "Refund order"}
        onClose={() => {
          if (!refundBusy) {
            setRefundOrder(null);
            setError("");
          }
        }}
      >
        <p className="muted">
          Stripe issues a sandbox refund. Stock is restored if it is still reserved. Choose a reason for
          the audit log.
        </p>
        <RefundForm
          staff
          busy={refundBusy}
          error={error}
          onCancel={() => {
            setRefundOrder(null);
            setError("");
          }}
          onSubmit={(body) => void refund(body)}
        />
      </Modal>
      <Modal
        open={Boolean(shipOrder)}
        title={shipOrder?.status === "WITH_COURIER" ? "Update tracking" : "Hand to courier"}
        onClose={() => setShipOrder(null)}
      >
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void saveShipment(event)}>
          <label className="field">
            <span>Carrier</span>
            <select
              value={form.carrier}
              onChange={(e) =>
                setForm({ ...form, carrier: e.target.value as (typeof SHIPPING_CARRIERS)[number] })
              }
            >
              {SHIPPING_CARRIERS.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {SHIPPING_CARRIER_META[carrier].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tracking number</span>
            <input
              value={form.trackingCode}
              onChange={(e) => setForm({ ...form, trackingCode: e.target.value })}
              placeholder={
                form.carrier === "posti"
                  ? "JJFI66012700410158170/32109367922"
                  : form.carrier === "postnord"
                    ? "00TEST123456789SE"
                    : "BUD-DEV-12345"
              }
              required
              autoFocus
            />
          </label>
          <div className="dims">
            <label className="field">
              <span>Delivery from</span>
              <input
                type="date"
                value={form.estimatedDeliveryFrom}
                onChange={(e) => setForm({ ...form, estimatedDeliveryFrom: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Delivery to</span>
              <input
                type="date"
                value={form.estimatedDeliveryTo}
                onChange={(e) => setForm({ ...form, estimatedDeliveryTo: e.target.value })}
                required
              />
            </label>
          </div>
          <p className="muted">
            The customer gets a shipped email with a Volt & Co order link and a {SHIPPING_CARRIER_META[form.carrier].name}{" "}
            tracking link.
            {form.carrier === "posti"
              ? " Posti URLs look like posti.fi/en/tracking/JJFI…/3210… — paste both numbers if Posti shows two."
              : ""}
          </p>
          <div className="actions">
            <button className="primary" type="submit">
              {shipOrder?.status === "WITH_COURIER" ? "Save tracking" : "Hand to courier"}
            </button>
            <button className="ghost" type="button" onClick={() => setShipOrder(null)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col" className="admin-row-lead">
                <span className="skip">Expand row</span>
              </th>
              <th scope="col">Order</th>
              <th scope="col">Total</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const expanded = openRows.includes(item.id);
              const lines = summaryLines(item.summary);
              const reference = item.reference || formatOrderReference(item.id);
              const customer = item.customerName || item.email || "—";
              const tracking = item.trackingCode
                ? `${SHIPPING_CARRIER_META[item.trackingCarrier as (typeof SHIPPING_CARRIERS)[number]]?.name ?? item.trackingCarrier} ${item.trackingCode}`
                : "—";
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td className="admin-row-lead">
                      <button
                        type="button"
                        className="admin-row-toggle"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${reference}`}
                        onClick={() => toggleRow(item.id)}
                      >
                        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                      </button>
                    </td>
                    <td className="admin-order-cell">
                      <div className="admin-order-id">
                        <span className="locator-code">{reference}</span>
                        <span>{customer}</span>
                      </div>
                    </td>
                    <td className="num">{money(item.total)}</td>
                    <td>
                      <div className="row-actions">
                        <select value={item.status} onChange={(e) => void setStatus(item.id, e.target.value)}>
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatOrderStatus(status)}
                            </option>
                          ))}
                        </select>
                        {["SHIPPING", "WITH_COURIER"].includes(item.status) && (
                          <button className="link" type="button" onClick={() => openShip(item)}>
                            {item.status === "WITH_COURIER" ? "Tracking" : "Courier"}
                          </button>
                        )}
                        {canRefund &&
                          (STAFF_REFUNDABLE_STATUSES as readonly string[]).includes(item.status) && (
                            <button
                              className="link"
                              type="button"
                              onClick={() => {
                                setRefundOrder(item);
                                setError("");
                              }}
                            >
                              Refund
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="admin-row-detail">
                      <td colSpan={4}>
                        <div className="admin-row-detail-grid">
                          <p>
                            <span className="kicker">Paid</span>
                            <span>{item.paidAt ? formatStoreDateTime(item.paidAt) : "—"}</span>
                          </p>
                          <div>
                            <span className="kicker">Ordered</span>
                            {lines.length ? (
                              <ul className="admin-order-summary-list">
                                {lines.map((line, index) => (
                                  <li key={`${item.id}-${index}`}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                          <p>
                            <span className="kicker">Tracking</span>
                            <span>{tracking}</span>
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

