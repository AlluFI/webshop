import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { FINLAND_VAT_RATE, formatLocatorCode, normalizeBarcode, productPricing, toDateTimeLocal } from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { money, type Product, type PromotionPeriod } from "@/lib/product";
import { PromotionHistoryModal } from "@/components/product-price";
import { BarcodeScanField } from "./BarcodeScanField";
import { Modal } from "./Modal";

const emptyProduct = {
  name: "",
  description: "",
  price: "99",
  promoPrice: "",
  promoStartsAt: "",
  promoEndsAt: "",
  wholesalePrice: "",
  vatRate: String(FINLAND_VAT_RATE),
  stockQuantity: "10",
  category: "accessories",
  brand: "volt",
  weightKg: "0.2",
  lengthCm: "10",
  widthCm: "10",
  heightCm: "4",
  featured: false,
  locatorStation: "1",
  locatorBlock: "1",
  locatorShelf: "1",
  locatorPlace: "1",
  wholesalerId: "",
  wholesaleSku: "",
  barcode: "",
  modelCode: "",
  colorName: "",
  warrantyMonths: "24",
  warrantyNote: "Manufacturer warranty",
  manufacturerUrl: "",
  brandUrl: "",
  packageContents: "",
  highlights: "",
  releaseYear: "",
  energyClass: "",
  attributes: [] as { name: string; value: string }[],
};


export function ProductsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [wholesalers, setWholesalers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveNote, setReceiveNote] = useState("");
  const [pendingReceive, setPendingReceive] = useState<{
    barcode: string;
    name: string;
    stockQuantity: number | null;
  } | null>(null);
  const [receiveQty, setReceiveQty] = useState("1");
  const [form, setForm] = useState(emptyProduct);
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyRows, setHistoryRows] = useState<PromotionPeriod[]>([]);

  function toggleRow(id: string) {
    setOpenRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );
  }

  async function load() {
    const [data, suppliers] = await Promise.all([
      api<{ items: Product[] }>("/admin/products?pageSize=24", { token }),
      api<{ items: { id: string; name: string }[] }>("/admin/wholesalers", { token }).catch(() => ({
        items: [] as { id: string; name: string }[],
      })),
    ]);
    setItems(data.items);
    setWholesalers(suppliers.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyProduct);
  }

  function openCreate() {
    setError("");
    setEditingId(null);
    setForm(emptyProduct);
    setOpen(true);
  }

  function startEdit(item: Product) {
    setError("");
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description,
      price: String(item.price),
      promoPrice: item.promoPrice == null ? "" : String(item.promoPrice),
      promoStartsAt: toDateTimeLocal(item.promoStartsAt),
      promoEndsAt: toDateTimeLocal(item.promoEndsAt),
      wholesalePrice: item.wholesalePrice == null ? "" : String(item.wholesalePrice),
      vatRate: String(item.vatRate ?? FINLAND_VAT_RATE),
      stockQuantity: String(item.stockQuantity),
      category: item.category.slug,
      brand: item.brand.slug,
      weightKg: String(item.weightKg),
      lengthCm: String(item.dimensions.metric.lengthCm),
      widthCm: String(item.dimensions.metric.widthCm),
      heightCm: String(item.dimensions.metric.heightCm),
      featured: Boolean(item.featured),
      locatorStation: String(item.locator?.station ?? 1),
      locatorBlock: String(item.locator?.block ?? 1),
      locatorShelf: String(item.locator?.shelf ?? 1),
      locatorPlace: String(item.locator?.place ?? 1),
      wholesalerId: item.wholesaler?.id ?? "",
      wholesaleSku: item.wholesaler?.sku ?? "",
      barcode: item.barcode ?? "",
      modelCode: item.modelCode ?? "",
      colorName: item.colorName ?? "",
      warrantyMonths: item.warrantyMonths == null ? "" : String(item.warrantyMonths),
      warrantyNote: item.warrantyNote ?? "",
      manufacturerUrl: item.manufacturerUrl ?? "",
      brandUrl: item.brandUrl ?? "",
      packageContents: item.packageContents ?? "",
      highlights: item.highlights ?? "",
      releaseYear: item.releaseYear == null ? "" : String(item.releaseYear),
      energyClass: item.energyClass ?? "",
      attributes: (item.attributes ?? []).map((row) => ({ name: row.name, value: row.value })),
    });
    setOpen(true);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body = JSON.stringify({
      ...form,
      price: Number(form.price),
      promoPrice: form.promoPrice === "" ? null : Number(form.promoPrice),
      promoStartsAt: form.promoStartsAt || null,
      promoEndsAt: form.promoEndsAt || null,
      wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
      vatRate: Number(form.vatRate || FINLAND_VAT_RATE),
      stockQuantity: Number(form.stockQuantity),
      weightKg: Number(form.weightKg),
      lengthCm: Number(form.lengthCm),
      widthCm: Number(form.widthCm),
      heightCm: Number(form.heightCm),
      locatorStation: Number(form.locatorStation),
      locatorBlock: Number(form.locatorBlock),
      locatorShelf: Number(form.locatorShelf),
      locatorPlace: Number(form.locatorPlace),
      wholesalerId: form.wholesalerId || null,
      wholesaleSku: form.wholesaleSku || null,
      barcode: form.barcode || null,
      warrantyMonths: form.warrantyMonths === "" ? null : Number(form.warrantyMonths),
      releaseYear: form.releaseYear === "" ? null : Number(form.releaseYear),
      manufacturerUrl: form.manufacturerUrl || null,
      brandUrl: form.brandUrl || null,
      modelCode: form.modelCode || null,
      colorName: form.colorName || null,
      warrantyNote: form.warrantyNote || null,
      packageContents: form.packageContents || null,
      highlights: form.highlights || null,
      energyClass: form.energyClass || null,
      attributes: form.attributes.filter((row) => row.name.trim() && row.value.trim()),
    });
    try {
      if (editingId) {
        await api(`/admin/products/${editingId}`, { method: "PATCH", token, body });
      } else {
        await api("/admin/products", { method: "POST", token, body });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save product");
    }
  }

  async function openHistory(item: Product) {
    setError("");
    try {
      const data = await api<{ items: PromotionPeriod[] }>(`/admin/products/${item.id}/promotions`, { token });
      setHistoryTitle(item.name);
      setHistoryRows(data.items);
      setHistoryOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load promotion history");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this product?")) return;
    setError("");
    try {
      await api(`/admin/products/${id}`, { method: "DELETE", token });
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete product");
    }
  }

  async function onImage(productId: string, file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("altText", file.name);
    await api(`/admin/products/${productId}/images`, { method: "POST", token, body });
    await load();
  }

  function closeReceive() {
    setReceiveOpen(false);
    setPendingReceive(null);
    setReceiveQty("1");
  }

  function onScannedBarcode(barcode: string) {
    setError("");
    setReceiveNote("");
    const match = items.find((item) => item.barcode && normalizeBarcode(item.barcode) === barcode);
    setPendingReceive({
      barcode,
      name: match?.name ?? "",
      stockQuantity: match?.stockQuantity ?? null,
    });
    setReceiveQty("1");
  }

  async function confirmReceive(event: FormEvent) {
    event.preventDefault();
    if (!pendingReceive) return;
    const quantity = Number(receiveQty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      setError("Enter how many pieces arrived (1–9999).");
      return;
    }
    setError("");
    setReceiveNote("");
    try {
      const row = await api<{ name: string; quantity: number; stockQuantity: number; barcode: string }>(
        "/admin/products/receive",
        { method: "POST", token, body: JSON.stringify({ barcode: pendingReceive.barcode, quantity }) },
      );
      setReceiveNote(`Received ${row.quantity} × ${row.name}. Stock is now ${row.stockQuantity}.`);
      setPendingReceive(null);
      setReceiveQty("1");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not receive that barcode");
    }
  }

  return (
    <div>
      {error && !open && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Products</h2>
        <div className="toolbar-actions">
          <button
            className="ghost"
            type="button"
            onClick={() => {
              setError("");
              setReceiveNote("");
              setPendingReceive(null);
              setReceiveQty("1");
              setReceiveOpen(true);
            }}
          >
            Receive stock
          </button>
          <button className="primary" type="button" onClick={openCreate}>
            Add product
          </button>
        </div>
      </div>
      <Modal open={open} title={editingId ? "Edit product" : "New product"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onSave(event)}>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </label>
          <div className="dims">
            <label className="field">
              <span>Retail price (incl. VAT)</span>
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label className="field">
              <span>Wholesale price</span>
              <input
                value={form.wholesalePrice}
                onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                placeholder="Net cost"
              />
            </label>
          </div>
          <div className="dims">
            <label className="field">
              <span>Promotion price</span>
              <input
                value={form.promoPrice}
                onChange={(e) => setForm({ ...form, promoPrice: e.target.value })}
                placeholder="Leave empty for no promotion"
              />
            </label>
            <label className="field">
              <span>Promotion starts</span>
              <input
                type="datetime-local"
                value={form.promoStartsAt}
                onChange={(e) => setForm({ ...form, promoStartsAt: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Promotion ends</span>
              <input
                type="datetime-local"
                value={form.promoEndsAt}
                onChange={(e) => setForm({ ...form, promoEndsAt: e.target.value })}
              />
            </label>
          </div>
          <p className="muted">
            A promotion is live only inside this date frame. The lowest shop price from the 30 days before
            the start is stored when you save. Clear all three fields to remove the promotion.
          </p>
          {editingId ? (
            <p>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  const item = items.find((row) => row.id === editingId);
                  if (item) void openHistory(item);
                }}
              >
                History
              </button>
            </p>
          ) : null}
          <div className="dims">
            <label className="field">
              <span>VAT %</span>
              <input value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
            </label>
            <label className="field">
              <span>Stock</span>
              <input
                value={form.stockQuantity}
                onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              />
            </label>
          </div>
          {(() => {
            const preview = productPricing(
              Number(form.price) || 0,
              form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
              Number(form.vatRate) || FINLAND_VAT_RATE,
            );
            return (
              <p className="muted">
                Net {money(preview.net)} · {`VAT ${preview.vatRate}%`} {money(preview.vat)}
                {preview.margin == null
                  ? " · Margin —"
                  : ` · Margin ${money(preview.margin)}${preview.marginPct == null ? "" : ` (${preview.marginPct}%)`}`}
              </p>
            );
          })()}
          <div className="dims">
            <label className="field">
              <span>Category slug</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label className="field">
              <span>Brand</span>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </label>
          </div>
          <label className="field choice">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Featured
          </label>
          <div className="dims dims-4">
            <label className="field">
              <span>Station</span>
              <input
                inputMode="numeric"
                value={form.locatorStation}
                onChange={(e) => setForm({ ...form, locatorStation: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Block</span>
              <input
                inputMode="numeric"
                value={form.locatorBlock}
                onChange={(e) => setForm({ ...form, locatorBlock: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Shelf</span>
              <input
                inputMode="numeric"
                value={form.locatorShelf}
                onChange={(e) => setForm({ ...form, locatorShelf: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Place</span>
              <input
                inputMode="numeric"
                value={form.locatorPlace}
                onChange={(e) => setForm({ ...form, locatorPlace: e.target.value })}
              />
            </label>
          </div>
          <p className="muted">
            Locator code{" "}
            <span className="locator-code">
              {formatLocatorCode(
                Number(form.locatorStation) || 1,
                Number(form.locatorBlock) || 1,
                Number(form.locatorShelf) || 1,
                Number(form.locatorPlace) || 1,
              )}
            </span>
          </p>
          <div className="dims">
            <label className="field">
              <span>Wholesaler</span>
              <select
                value={form.wholesalerId}
                onChange={(e) => setForm({ ...form, wholesalerId: e.target.value })}
              >
                <option value="">None</option>
                {wholesalers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Wholesale SKU</span>
              <input
                value={form.wholesaleSku}
                onChange={(e) => setForm({ ...form, wholesaleSku: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>Barcode</span>
            <input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="EAN-13 / UPC / warehouse code"
            />
          </label>
          <fieldset className="fieldset-block">
            <legend>Product information</legend>
            <div className="dims">
              <label className="field">
                <span>Model</span>
                <input
                  value={form.modelCode}
                  onChange={(e) => setForm({ ...form, modelCode: e.target.value })}
                  placeholder="WH-1000XM5"
                />
              </label>
              <label className="field">
                <span>Color</span>
                <input
                  value={form.colorName}
                  onChange={(e) => setForm({ ...form, colorName: e.target.value })}
                  placeholder="Black"
                />
              </label>
            </div>
            <div className="dims">
              <label className="field">
                <span>Release year</span>
                <input
                  inputMode="numeric"
                  value={form.releaseYear}
                  onChange={(e) => setForm({ ...form, releaseYear: e.target.value })}
                  placeholder="2022"
                />
              </label>
              <label className="field">
                <span>Energy class</span>
                <input
                  value={form.energyClass}
                  onChange={(e) => setForm({ ...form, energyClass: e.target.value })}
                  placeholder="A–G"
                />
              </label>
            </div>
            <div className="dims">
              <label className="field">
                <span>Warranty (months)</span>
                <input
                  inputMode="numeric"
                  value={form.warrantyMonths}
                  onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                  placeholder="24"
                />
              </label>
              <label className="field">
                <span>Warranty note</span>
                <input
                  value={form.warrantyNote}
                  onChange={(e) => setForm({ ...form, warrantyNote: e.target.value })}
                  placeholder="Manufacturer warranty"
                />
              </label>
            </div>
            <label className="field">
              <span>Manufacturer product page</span>
              <input
                type="url"
                value={form.manufacturerUrl}
                onChange={(e) => setForm({ ...form, manufacturerUrl: e.target.value })}
                placeholder="https://www.sony.com/..."
              />
            </label>
            <label className="field">
              <span>Brand website</span>
              <input
                type="url"
                value={form.brandUrl}
                onChange={(e) => setForm({ ...form, brandUrl: e.target.value })}
                placeholder="https://www.sony.fi"
              />
            </label>
            <label className="field">
              <span>Key highlights</span>
              <textarea
                value={form.highlights}
                onChange={(e) => setForm({ ...form, highlights: e.target.value })}
                placeholder="One highlight per line"
                rows={4}
              />
            </label>
            <label className="field">
              <span>What&apos;s in the box</span>
              <textarea
                value={form.packageContents}
                onChange={(e) => setForm({ ...form, packageContents: e.target.value })}
                placeholder="One item per line"
                rows={3}
              />
            </label>
            <div className="field">
              <span>Extra specifications</span>
              {form.attributes.map((row, index) => (
                <div className="spec-row" key={`${row.name}-${index}`}>
                  <input
                    value={row.name}
                    onChange={(e) => {
                      const attributes = form.attributes.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: e.target.value } : item,
                      );
                      setForm({ ...form, attributes });
                    }}
                    placeholder="Name"
                  />
                  <input
                    value={row.value}
                    onChange={(e) => {
                      const attributes = form.attributes.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: e.target.value } : item,
                      );
                      setForm({ ...form, attributes });
                    }}
                    placeholder="Value"
                  />
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        attributes: form.attributes.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="ghost"
                type="button"
                onClick={() => setForm({ ...form, attributes: [...form.attributes, { name: "", value: "" }] })}
              >
                Add specification
              </button>
            </div>
          </fieldset>
          <div className="actions">
            <button className="primary" type="submit">
              {editingId ? "Save changes" : "Create"}
            </button>
            <button className="ghost" type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
      <Modal open={receiveOpen} title="Receive stock" onClose={closeReceive}>
        {error && <p className="banner error">{error}</p>}
        {receiveNote && <p className="banner">{receiveNote}</p>}
        <p className="muted">
          Scan or type a barcode once. Then enter how many pieces arrived — you do not need to scan each unit.
        </p>
        <BarcodeScanField onScan={onScannedBarcode} label="Delivery barcode" />
        {pendingReceive && (
          <form className="receive-confirm" onSubmit={(event) => void confirmReceive(event)}>
            <p>
              <strong>{pendingReceive.name || "Matched barcode"}</strong>
              <span className="locator-code"> {pendingReceive.barcode}</span>
            </p>
            <p className="muted">
              {pendingReceive.stockQuantity == null
                ? "Enter the number of pieces in this delivery."
                : `Current stock ${pendingReceive.stockQuantity}. Enter the number of pieces in this delivery.`}
            </p>
            <label className="field">
              <span>Pieces received</span>
              <input
                autoFocus
                inputMode="numeric"
                value={receiveQty}
                onChange={(event) => setReceiveQty(event.target.value)}
              />
            </label>
            <div className="actions">
              <button className="primary" type="submit">
                Add to stock
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setPendingReceive(null);
                  setReceiveQty("1");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="actions">
          <button className="ghost" type="button" onClick={closeReceive}>
            Close
          </button>
        </div>
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col" className="admin-row-lead">
                <span className="skip">Expand row</span>
              </th>
              <th scope="col">Product</th>
              <th scope="col">Retail</th>
              <th scope="col">Wholesale</th>
              <th scope="col">Margin</th>
              <th scope="col">Stock</th>
              <th scope="col">Category</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const expanded = openRows.includes(item.id);
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td className="admin-row-lead">
                      <button
                        type="button"
                        className="admin-row-toggle"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
                        onClick={() => toggleRow(item.id)}
                      >
                        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                      </button>
                    </td>
                    <td>
                      <Link href={`/products/${item.slug}`}>{item.name}</Link>
                    </td>
                    <td className="num">
                      {item.onPromotion ? (
                        <>
                          <strong>{money(item.sellingPrice ?? item.price)}</strong>
                          <div className="muted">{money(item.price)}</div>
                        </>
                      ) : (
                        money(item.price)
                      )}
                    </td>
                    <td className="num">{item.wholesalePrice == null ? "—" : money(item.wholesalePrice)}</td>
                    <td className="num">
                      {item.pricing?.margin == null ? "—" : money(item.pricing.margin)}
                    </td>
                    <td className="num">{item.stockQuantity}</td>
                    <td>{item.category.name}</td>
                  </tr>
                  {expanded ? (
                    <tr className="admin-row-detail">
                      <td colSpan={7}>
                        <div className="admin-row-detail-grid">
                          <p>
                            <span className="kicker">Locator</span>
                            <span className="locator-code">{item.locator?.code ?? "—"}</span>
                          </p>
                          <p>
                            <span className="kicker">Barcode</span>
                            <span className="locator-code">{item.barcode ?? "—"}</span>
                          </p>
                          <p>
                            <span className="kicker">Wholesaler</span>
                            <span>{item.wholesaler?.name ?? "—"}</span>
                          </p>
                          <div className="row-actions">
                            <button className="link" type="button" onClick={() => startEdit(item)}>
                              Edit
                            </button>
                            <button className="link" type="button" onClick={() => void onDelete(item.id)}>
                              Delete
                            </button>
                            <label className="file-label">
                              <span className="skip">Upload image for {item.name}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => void onImage(item.id, e.target.files?.[0] ?? null)}
                              />
                            </label>
                          </div>
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
      <PromotionHistoryModal
        open={historyOpen}
        title={historyTitle}
        periods={historyRows}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

