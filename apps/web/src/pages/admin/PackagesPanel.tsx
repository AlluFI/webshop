import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api";
import { Modal } from "./Modal";

type PackageRow = {
  id: string;
  code: string;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg: number;
  stockQuantity: number;
  incomingQuantity: number;
  active: boolean;
};

export function PackagesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<PackageRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderRow, setOrderRow] = useState<PackageRow | null>(null);
  const [receiveRow, setReceiveRow] = useState<PackageRow | null>(null);
  const [quantity, setQuantity] = useState("20");

  async function load() {
    const data = await api<{ items: PackageRow[] }>("/admin/packages", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeModals() {
    setOrderRow(null);
    setReceiveRow(null);
    setQuantity("20");
    setError("");
  }

  async function onOrder(event: FormEvent) {
    event.preventDefault();
    if (!orderRow) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ order: { reference: string; quantity: number } }>(
        `/admin/packages/${orderRow.id}/order`,
        { method: "POST", token, body: JSON.stringify({ quantity: Number(quantity) }) },
      );
      setMessage(`Ordered ${result.order.quantity} × ${orderRow.name}. Reference ${result.order.reference}. Check Mailpit.`);
      closeModals();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not order packaging");
    } finally {
      setBusy(false);
    }
  }

  async function onReceive(event: FormEvent) {
    event.preventDefault();
    if (!receiveRow) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/packages/${receiveRow.id}/receive`, {
        method: "POST",
        token,
        body: JSON.stringify({ quantity: Number(quantity) }),
      });
      setMessage(`Received ${quantity} × ${receiveRow.name} into stock.`);
      closeModals();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not receive packaging");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && !orderRow && !receiveRow && <p className="banner error">{error}</p>}
      {message && <p className="banner ok">{message}</p>}
      <div className="toolbar">
        <h2>Packages</h2>
        <p className="muted">
          Standard Posti parcel boxes. Picking uses product dimensions to recommend the smallest box that
          fits. Order more when stock is low — Mailpit shows the supplier email locally.
        </p>
      </div>
      <Modal
        open={Boolean(orderRow)}
        title={orderRow ? `Order more ${orderRow.name}` : "Order packaging"}
        onClose={closeModals}
      >
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onOrder(event)}>
          <p className="muted">
            {orderRow
              ? `${orderRow.lengthCm} × ${orderRow.widthCm} × ${orderRow.heightCm} cm · stock ${orderRow.stockQuantity}`
              : null}
          </p>
          <label className="field">
            <span>Quantity</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Ordering…" : "Send order"}
            </button>
            <button className="ghost" type="button" onClick={closeModals}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(receiveRow)}
        title={receiveRow ? `Receive ${receiveRow.name}` : "Receive packaging"}
        onClose={closeModals}
      >
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onReceive(event)}>
          <p className="muted">{receiveRow ? `${receiveRow.incomingQuantity} boxes are on order.` : null}</p>
          <label className="field">
            <span>Quantity received</span>
            <input
              type="number"
              min={1}
              max={receiveRow?.incomingQuantity || 1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add to stock"}
            </button>
            <button className="ghost" type="button" onClick={closeModals}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Inner size</th>
              <th scope="col">Max kg</th>
              <th scope="col">Stock</th>
              <th scope="col">On order</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>
                  {item.lengthCm} × {item.widthCm} × {item.heightCm} cm
                </td>
                <td className="num">{item.maxWeightKg}</td>
                <td className="num">{item.stockQuantity}</td>
                <td className="num">{item.incomingQuantity || "—"}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="link"
                      type="button"
                      onClick={() => {
                        setMessage("");
                        setOrderRow(item);
                        setQuantity("20");
                      }}
                    >
                      Order more
                    </button>
                    {item.incomingQuantity > 0 ? (
                      <button
                        className="link"
                        type="button"
                        onClick={() => {
                          setMessage("");
                          setReceiveRow(item);
                          setQuantity(String(item.incomingQuantity));
                        }}
                      >
                        Receive
                      </button>
                    ) : null}
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
