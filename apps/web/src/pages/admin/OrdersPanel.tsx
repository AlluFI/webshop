import { useEffect, useState, type FormEvent } from "react";
import {
  addStoreDays,
  ORDER_STATUSES,
  SHIPPING_CARRIERS,
  SHIPPING_CARRIER_META,
  STAFF_REFUNDABLE_STATUSES,
  storeCalendarDate,
} from "@volt/shared";
import { api, ApiError } from "../../api";
import { money } from "../../product";
import { RefundForm } from "../../RefundForm";
import { Modal } from "./Modal";

function isoDatePlus(days: number) {
  return storeCalendarDate(addStoreDays(new Date(), days));
}

export function OrdersPanel({ token, canRefund }: { token: string; canRefund: boolean }) {
  const [items, setItems] = useState<
    {
      id: string;
      status: string;
      total: number;
      summary: string;
      createdAt: string;
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
    if (status === "SHIPPED") {
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
          status: "SHIPPED",
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
        title={refundOrder ? `Refund ${refundOrder.id.slice(0, 8)}` : "Refund order"}
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
        title={shipOrder?.status === "SHIPPED" ? "Update tracking" : "Ship order"}
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
              {shipOrder?.status === "SHIPPED" ? "Save tracking" : "Mark shipped"}
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
              <th scope="col">Order</th>
              <th scope="col">Status</th>
              <th scope="col">Total</th>
              <th scope="col">Summary</th>
              <th scope="col">Tracking</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}</td>
                <td>{item.status}</td>
                <td className="num">{money(item.total)}</td>
                <td>{item.summary}</td>
                <td>
                  {item.trackingCode
                    ? `${SHIPPING_CARRIER_META[item.trackingCarrier as (typeof SHIPPING_CARRIERS)[number]]?.name ?? item.trackingCarrier} ${item.trackingCode}`
                    : "—"}
                </td>
                <td>
                  <div className="row-actions">
                    <select value={item.status} onChange={(e) => void setStatus(item.id, e.target.value)}>
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {["PAID", "PROCESSING", "SHIPPED"].includes(item.status) && (
                      <button className="link" type="button" onClick={() => openShip(item)}>
                        {item.status === "SHIPPED" ? "Tracking" : "Ship"}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

