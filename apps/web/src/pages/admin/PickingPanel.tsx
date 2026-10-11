import { useCallback, useEffect, useState } from "react";
import { formatOrderStatus, formatStoreDateTime, normalizeBarcode } from "@volt/shared";
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

type PickOrder = {
  id: string;
  reference: string;
  status: "PAID" | "PROCESSING";
  createdAt: string;
  itemCount: number;
  summary: string;
  items: PickLine[];
};

export function PickingPanel({ token }: { token: string }) {
  const [items, setItems] = useState<PickOrder[]>([]);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<PickOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");

  async function load() {
    const data = await api<{ items: PickOrder[] }>("/admin/orders/picking", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function openOrder(row: PickOrder) {
    setError("");
    setScanNote("");
    setOrder(row);
    setConfirming(false);
    setPicked(Object.fromEntries(row.items.map((item) => [item.id, false])));
  }

  function closeOrder() {
    if (busy) return;
    setOrder(null);
    setConfirming(false);
    setError("");
    setScanNote("");
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
      setOrder(null);
      setConfirming(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete this pick");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && !order && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Picking</h2>
        <p className="muted">
          Paid and processing orders, oldest first. Process an order before ticking picked lines. A barcode
          scanner is optional and does not replace the checkboxes.
        </p>
      </div>
      <Modal
        open={Boolean(order)}
        title={
          confirming
            ? `Confirm pick ${order?.reference ?? ""}`
            : order
              ? `Pick ${order.reference}`
              : "Pick order"
        }
        onClose={closeOrder}
      >
        {error && <p className="banner error">{error}</p>}
        {order && !confirming && (
          <>
            <p className="muted">
              {formatOrderStatus(order.status)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·
              placed {formatStoreDateTime(order.createdAt)}
            </p>
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
                onClick={() => setConfirming(true)}
              >
                Order completed
              </button>
              <button className="ghost" type="button" onClick={closeOrder}>
                Close
              </button>
            </div>
          </>
        )}
        {order && confirming && (
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
              <button className="ghost" type="button" disabled={busy} onClick={() => setConfirming(false)}>
                Back
              </button>
            </div>
          </>
        )}
      </Modal>
      {items.length === 0 ? (
        <p className="muted">No paid orders are waiting to be picked.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Status</th>
                <th scope="col">Placed</th>
                <th scope="col">Items</th>
                <th scope="col">Products</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="pickable" onClick={() => openOrder(item)}>
                  <td>
                    <button className="link" type="button">
                      {item.reference}
                    </button>
                  </td>
                  <td>{formatOrderStatus(item.status)}</td>
                  <td>{formatStoreDateTime(item.createdAt)}</td>
                  <td className="num">{item.itemCount}</td>
                  <td>{item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
