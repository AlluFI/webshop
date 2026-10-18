import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addStoreDays,
  comparePickingPriority,
  formatOrderStatus,
  formatParcelAddress,
  isExpressShipping,
  formatStoreDateTime,
  normalizeBarcode,
  POSTI_LIVE_TEST_TRACKING,
  type PackageRecommendation,
  SHIPPING_CARRIERS,
  SHIPPING_CARRIER_META,
  storeCalendarDate,
  type ShippingCarrier,
} from "@volt/shared";
import { api, ApiError } from "../../api";
import { BarcodeScanField } from "./BarcodeScanField";
import { Modal } from "./Modal";

type PickLine = {
  id: string;
  name: string;
  quantity: number;
  locatorCode: string;
  barcode: string | null;
  thumbnail: string | null;
};

type ShippingAddress = {
  recipientName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
  countryName?: string;
};

type PickOrder = {
  id: string;
  reference: string;
  status: "PAID" | "PROCESSING" | "SHIPPING";
  createdAt: string;
  itemCount: number;
  summary: string;
  customerName?: string;
  shipping?: ShippingAddress | null;
  shippingMethod?: string;
  trackingCarrier?: string | null;
  trackingCode?: string | null;
  estimatedDeliveryFrom?: string | null;
  estimatedDeliveryTo?: string | null;
  packaging?: PackageRecommendation;
  items: PickLine[];
};

type Step = "pick" | "confirm" | "ship";

function isoDatePlus(days: number) {
  return storeCalendarDate(addStoreDays(new Date(), days));
}

function printParcelLabel(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const page = window.open(url, "_blank", "noopener,noreferrer,width=580,height=860");
  if (!page) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

function PackageHint({ packaging }: { packaging?: PackageRecommendation }) {
  if (!packaging) return null;
  return (
    <div className={`package-hint${packaging.stockLow || !packaging.code ? " warn" : ""}`}>
      <p className="kicker">Suggested packaging</p>
      <p>
        <strong>
          {packaging.boxCount > 1 ? `${packaging.boxCount} × ` : ""}
          {packaging.name}
        </strong>
        {packaging.lengthCm
          ? ` · ${packaging.lengthCm} × ${packaging.widthCm} × ${packaging.heightCm} cm · max ${packaging.maxWeightKg} kg`
          : null}
      </p>
      <p className="muted">{packaging.note}</p>
    </div>
  );
}

function ExpressMark() {
  return (
    <span className="express-flag" title="Express delivery — handle first">
      <span aria-hidden="true">!</span>
      Express
    </span>
  );
}

function AddressBlock({ address }: { address?: ShippingAddress | null }) {
  const lines = formatParcelAddress(address);
  if (!lines.length) return <p className="muted">Delivery address is unavailable for this order.</p>;
  return (
    <p className="ship-address">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </p>
  );
}

export function PickingPanel({ token }: { token: string }) {
  const [items, setItems] = useState<PickOrder[]>([]);
  const [postiMode, setPostiMode] = useState<"mock" | "live">("live");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<PickOrder | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [form, setForm] = useState({
    carrier: "posti" as ShippingCarrier,
    trackingCode: "",
    estimatedDeliveryFrom: isoDatePlus(3),
    estimatedDeliveryTo: isoDatePlus(5),
  });
  const [labelMeta, setLabelMeta] = useState("");

  async function load() {
    const data = await api<{ items: PickOrder[]; postiMode?: "mock" | "live" }>("/admin/orders/picking", { token });
    setItems([...data.items].sort(comparePickingPriority));
    setPostiMode(data.postiMode === "mock" ? "mock" : "live");
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function shipDefaults(row: PickOrder) {
    const express = row.shippingMethod === "express";
    const carrier = (row.trackingCarrier as ShippingCarrier) || "posti";
    return {
      carrier,
      trackingCode: row.trackingCode || "",
      estimatedDeliveryFrom: row.estimatedDeliveryFrom || isoDatePlus(express ? 1 : 3),
      estimatedDeliveryTo: row.estimatedDeliveryTo || isoDatePlus(express ? 2 : 5),
    };
  }

  function openOrder(row: PickOrder) {
    setError("");
    setScanNote("");
    setLabelMeta("");
    setOrder(row);
    setForm(shipDefaults(row));
    if (row.status === "SHIPPING") {
      setStep("ship");
      return;
    }
    setStep("pick");
    setPicked(Object.fromEntries(row.items.map((item) => [item.id, false])));
  }

  function closeOrder() {
    if (busy) return;
    setOrder(null);
    setStep("pick");
    setError("");
    setScanNote("");
    setLabelMeta("");
  }

  const processing = order?.status === "PROCESSING";
  const allPicked = Boolean(processing && order.items.length && order.items.every((item) => picked[item.id]));

  const applyScan = useCallback(
    (code: string) => {
      if (!order || order.status !== "PROCESSING") return;
      const match = order.items.find((item) => item.barcode && normalizeBarcode(item.barcode) === code);
      if (!match) {
        setScanNote(`No line on this order has barcode ${code}. Tick the box by hand if needed.`);
        return;
      }
      setPicked((current) => ({ ...current, [match.id]: true }));
      setScanNote(`Picked ${match.name}.`);
    },
    [order],
  );

  async function startProcess() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/orders/${order.id}/process`, { method: "POST", token });
      setOrder({ ...order, status: "PROCESSING" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start processing");
    } finally {
      setBusy(false);
    }
  }

  async function completePick() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/orders/${order.id}/pick`, {
        method: "POST",
        token,
        body: JSON.stringify({
          items: order.items.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      });
      const next = { ...order, status: "SHIPPING" as const };
      setOrder(next);
      setForm(shipDefaults(next));
      setStep("ship");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete this pick");
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  }

  async function onPrintLabel() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<{
        carrier: ShippingCarrier;
        trackingCode: string;
        productName: string;
        source: "mock" | "live";
        label: { contentType: string; body: string };
      }>(`/admin/orders/${order.id}/shipment`, {
        method: "POST",
        token,
        body: JSON.stringify({
          carrier: form.carrier,
          trackingCode: form.trackingCode.trim() || undefined,
        }),
      });
      setForm((current) => ({ ...current, carrier: created.carrier, trackingCode: created.trackingCode }));
      setOrder({ ...order, trackingCarrier: created.carrier, trackingCode: created.trackingCode });
      setLabelMeta(
        `${created.source === "live" ? "Live" : "Mock"} ${SHIPPING_CARRIER_META[created.carrier].name} · ${created.productName}`,
      );
      if (created.label.contentType !== "text/html" || !created.label.body) {
        setError("Shipment was created, but this label format cannot be printed here yet.");
        return;
      }
      const opened = printParcelLabel(created.label.body);
      if (!opened) setError("Allow pop-ups to print the parcel label.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the parcel label");
    } finally {
      setBusy(false);
    }
  }

  async function handToCourier(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/orders/${order.id}/status`, {
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
      setOrder(null);
      setStep("pick");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save tracking");
    } finally {
      setBusy(false);
    }
  }

  const express = isExpressShipping(order?.shippingMethod);
  const title =
    step === "confirm"
      ? `Confirm pick ${order?.reference ?? ""}`
      : step === "ship"
        ? `Ship ${order?.reference ?? ""}`
        : order
          ? `Pick ${order.reference}`
          : "Handle order";

  return (
    <div>
      {error && !order && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Order handling</h2>
        <p className="muted">
          Express orders are listed first, oldest to newest, then standard. Once the order is with the
          courier it leaves this list and stays under Orders.
        </p>
      </div>
      <Modal open={Boolean(order)} title={title} onClose={closeOrder}>
        {error && <p className="banner error">{error}</p>}
        {order && express ? (
          <p className="express-banner">
            <ExpressMark /> Handle this order first.
          </p>
        ) : null}
        {order && step === "pick" && (
          <>
            <p className="muted">
              {formatOrderStatus(order.status)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·
              placed {formatStoreDateTime(order.createdAt)}
              {order.customerName ? ` · ${order.customerName}` : ""}
            </p>
            <PackageHint packaging={order.packaging} />
            {!processing && (
              <p className="muted">Press Process to start this order. Lines stay locked until then.</p>
            )}
            {processing && (
              <>
                <BarcodeScanField
                  onScan={applyScan}
                  label="Scan barcode"
                  hint="USB scanners work in this box. On a phone, Use camera takes a photo of the barcode. You can still tick lines by hand."
                />
                {scanNote && <p className="banner">{scanNote}</p>}
              </>
            )}
            <ul className="pick-lines">
              {order.items.map((item) => (
                <li key={item.id}>
                  <label className={`pick-line${picked[item.id] ? " done" : ""}${processing ? "" : " locked"}`}>
                    <input
                      type="checkbox"
                      disabled={!processing}
                      checked={Boolean(picked[item.id])}
                      onChange={(event) =>
                        setPicked((current) => ({ ...current, [item.id]: event.target.checked }))
                      }
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <span className="muted"> × {item.quantity}</span>
                      {item.barcode ? <span className="locator-code"> {item.barcode}</span> : null}
                    </span>
                    <span className="locator-code">{item.locatorCode}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="actions">
              {!processing && (
                <button className="primary" type="button" disabled={busy} onClick={() => void startProcess()}>
                  {busy ? "Saving…" : "Process"}
                </button>
              )}
              <button
                className="primary"
                type="button"
                disabled={!allPicked}
                onClick={() => setStep("confirm")}
              >
                Order completed
              </button>
              <button className="ghost" type="button" onClick={closeOrder}>
                Close
              </button>
            </div>
          </>
        )}
        {order && step === "confirm" && (
          <>
            <p>Confirm that these products were picked and placed on the order:</p>
            <ul className="pick-confirm">
              {order.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong> × {item.quantity}{" "}
                  <span className="locator-code">{item.locatorCode}</span>
                </li>
              ))}
            </ul>
            <div className="actions">
              <button className="primary" type="button" disabled={busy} onClick={() => void completePick()}>
                {busy ? "Saving…" : "Confirm pick"}
              </button>
              <button className="ghost" type="button" disabled={busy} onClick={() => setStep("pick")}>
                Back
              </button>
            </div>
          </>
        )}
        {order && step === "ship" && (
          <form onSubmit={(event) => void handToCourier(event)}>
            <p className="muted">
              Picking is done. Print label creates a shipment through the selected carrier adapter (mock
              today: Volt’s own label and a demo tracking code). Hand the parcel to the courier when it is
              ready to leave.
            </p>
            <PackageHint packaging={order.packaging} />
            <div className="ship-panel">
              <div>
                <p className="kicker">Deliver to</p>
                <AddressBlock address={order.shipping} />
              </div>
              <div>
                <p className="kicker">Contents</p>
                <ul className="admin-order-summary-list">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <label className="field">
              <span>Carrier</span>
              <select
                value={form.carrier}
                onChange={(event) => {
                  const carrier = event.target.value as ShippingCarrier;
                  setForm({
                    ...form,
                    carrier,
                    trackingCode: order.trackingCarrier === carrier ? order.trackingCode || "" : "",
                  });
                  setLabelMeta("");
                }}
              >
                {SHIPPING_CARRIERS.map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {SHIPPING_CARRIER_META[carrier].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                Tracking number
                {postiMode === "mock" ? (
                  <> (to test live tracking use {POSTI_LIVE_TEST_TRACKING})</>
                ) : null}
              </span>
              <input
                value={form.trackingCode}
                onChange={(event) => setForm({ ...form, trackingCode: event.target.value })}
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
                  onChange={(event) => setForm({ ...form, estimatedDeliveryFrom: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Delivery to</span>
                <input
                  type="date"
                  value={form.estimatedDeliveryTo}
                  onChange={(event) => setForm({ ...form, estimatedDeliveryTo: event.target.value })}
                  required
                />
              </label>
            </div>
            {labelMeta ? <p className="muted">{labelMeta}</p> : null}
            <p className="muted">
              Saving tracking emails the customer with a {SHIPPING_CARRIER_META[form.carrier].name} tracking
              link and removes the order from this list.
            </p>
            <div className="actions">
              <button className="ghost" type="button" disabled={busy} onClick={() => void onPrintLabel()}>
                {busy ? "Creating…" : form.trackingCode ? "Print label" : "Create label"}
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Hand to courier"}
              </button>
              <button className="ghost" type="button" disabled={busy} onClick={closeOrder}>
                Close
              </button>
            </div>
          </form>
        )}
      </Modal>
      {items.length === 0 ? (
        <p className="muted">No orders are waiting to be picked or shipped.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Status</th>
                <th scope="col">Placed</th>
                <th scope="col">Items</th>
                <th scope="col">Products</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`pickable${isExpressShipping(item.shippingMethod) ? " express" : ""}`}
                  onClick={() => openOrder(item)}
                >
                  <td>
                    {isExpressShipping(item.shippingMethod) ? <ExpressMark /> : null}
                    <button className="link" type="button">
                      {item.reference}
                    </button>
                  </td>
                  <td>{item.customerName || "—"}</td>
                  <td>{formatOrderStatus(item.status)}</td>
                  <td>{formatStoreDateTime(item.createdAt)}</td>
                  <td className="num">{item.itemCount}</td>
                  <td>
                    <ul className="admin-order-summary-list">
                      {item.summary
                        .split(", ")
                        .filter(Boolean)
                        .map((line, index) => (
                          <li key={`${item.id}-${index}`}>{line}</li>
                        ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
