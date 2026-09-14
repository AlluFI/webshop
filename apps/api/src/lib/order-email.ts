import { FREE_STANDARD_THRESHOLD, STORE_CURRENCY } from "@volt/shared";

export type OrderEmailItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl?: string | null;
  productUrl?: string | null;
};

export type OrderEmailShipping = {
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postal: string;
  countryName: string;
};

export type OrderEmailDetails = {
  orderId: string;
  orderUrl: string;
  status: string;
  paymentStatus: string;
  placedAt: Date;
  customerName: string;
  email: string;
  phone?: string;
  items: OrderEmailItem[];
  subtotal: number;
  shippingCost: number;
  shippingMethod: string;
  tax: number;
  total: number;
  currency?: string;
  shipping?: OrderEmailShipping | null;
};

const FOREST = "#1f3d34";
const GOLD = "#c9a227";
const INK = "#1b241f";
const MUTED = "#5c675f";
const PAPER = "#f4efe4";
const CARD = "#fffdf8";
const LINE = "#ddd4c4";

export function formatMoney(value: number, currency = STORE_CURRENCY) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value);
}

export function humanStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function shippingLabel(method: string, shippingCost: number) {
  if (method === "express") return "Express (1–2 business days)";
  if (shippingCost === 0) return `Standard (free over ${formatMoney(FREE_STANDARD_THRESHOLD)})`;
  return "Standard (3–5 business days)";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPlacedAt(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function shortId(orderId: string) {
  return orderId.slice(0, 8);
}

function shippingLines(shipping: OrderEmailShipping) {
  return [
    shipping.recipientName,
    shipping.line1,
    shipping.line2,
    [shipping.postal, shipping.city].filter(Boolean).join(" "),
    shipping.region,
    shipping.countryName,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export function buildOrderPaidEmail(details: OrderEmailDetails) {
  const currency = details.currency || STORE_CURRENCY;
  const money = (value: number) => formatMoney(value, currency);
  const status = humanStatus(details.status);
  const payment = humanStatus(details.paymentStatus);
  const shipLabel = shippingLabel(details.shippingMethod, details.shippingCost);
  const placed = formatPlacedAt(details.placedAt);
  const ref = shortId(details.orderId);
  const ship = details.shipping ? shippingLines(details.shipping) : [];

  const subject = `Your Volt & Co order ${ref} is confirmed`;

  const itemText = details.items
    .map(
      (item) =>
        `- ${item.name} ×${item.quantity}  ${money(item.lineTotal)}  (${money(item.unitPrice)} each)`,
    )
    .join("\n");

  const text = [
    `Hi ${details.customerName || "there"},`,
    "",
    "Thanks for your order. We have received your payment and are getting it ready.",
    "",
    `Order: ${details.orderId}`,
    `Placed: ${placed}`,
    `Status: ${status}`,
    `Payment: ${payment}`,
    "",
    "Items",
    itemText || "- (no items)",
    "",
    `Subtotal: ${money(details.subtotal)}`,
    `Shipping: ${money(details.shippingCost)} — ${shipLabel}`,
    `Tax: ${money(details.tax)}`,
    `Total: ${money(details.total)}`,
    "",
    ship.length ? ["Ship to", ...ship.map((line) => line)].join("\n") : "",
    details.phone ? `Phone: ${details.phone}` : "",
    "",
    `View your order:\n${details.orderUrl}`,
    "",
    "Volt & Co",
  ]
    .filter((block) => block !== "")
    .join("\n");

  const itemRows = details.items
    .map((item) => {
      const thumb = item.thumbnailUrl
        ? `<img src="${escapeHtml(item.thumbnailUrl)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;background:#ece6d8;border:1px solid ${LINE};" />`
        : `<div style="width:64px;height:64px;border-radius:8px;background:#ece6d8;border:1px solid ${LINE};"></div>`;
      const name = item.productUrl
        ? `<a href="${escapeHtml(item.productUrl)}" style="color:${FOREST};text-decoration:none;font-weight:600;">${escapeHtml(item.name)}</a>`
        : `<strong style="color:${INK};">${escapeHtml(item.name)}</strong>`;
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};vertical-align:top;width:72px;">${thumb}</td>
        <td style="padding:12px 8px;border-bottom:1px solid ${LINE};vertical-align:top;">
          ${name}<br />
          <span style="color:${MUTED};font-size:13px;">Qty ${item.quantity} · ${escapeHtml(money(item.unitPrice))} each</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};vertical-align:top;text-align:right;white-space:nowrap;font-weight:600;">${escapeHtml(money(item.lineTotal))}</td>
      </tr>`;
    })
    .join("");

  const addressHtml = ship.length
    ? `<p style="margin:0;color:${INK};line-height:1.5;">${ship.map(escapeHtml).join("<br />")}</p>`
    : `<p style="margin:0;color:${MUTED};">Shipping details are on your order page.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CARD};border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:${FOREST};color:#f7f3ea;padding:22px 28px;font-family:Georgia,serif;">
              <div style="font-size:22px;letter-spacing:0.01em;">Volt <span style="color:${GOLD};">&amp;</span> Co</div>
              <div style="margin-top:8px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">Order confirmation</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:'Source Sans 3',Arial,sans-serif;font-size:16px;line-height:1.5;">
              <p style="margin:0 0 12px;font-size:22px;font-family:Georgia,serif;">Thanks, ${escapeHtml(details.customerName || "there")}.</p>
              <p style="margin:0 0 20px;color:${MUTED};">We received your payment and your order is confirmed. A summary is below — you can track status any time from your account.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${PAPER};border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;width:50%;vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Order</div>
                    <div style="margin-top:4px;font-weight:600;">${escapeHtml(ref)}</div>
                    <div style="margin-top:2px;font-size:13px;color:${MUTED};word-break:break-all;">${escapeHtml(details.orderId)}</div>
                  </td>
                  <td style="padding:14px 16px;width:50%;vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Status</div>
                    <div style="margin-top:4px;font-weight:600;color:${FOREST};">${escapeHtml(status)}</div>
                    <div style="margin-top:2px;font-size:13px;color:${MUTED};">Payment ${escapeHtml(payment)}</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0 16px 14px;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Placed</div>
                    <div style="margin-top:4px;">${escapeHtml(placed)}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${FOREST};font-weight:600;">Items</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 22px;">
                <tr><td style="padding:6px 0;color:${MUTED};">Subtotal</td><td style="padding:6px 0;text-align:right;">${escapeHtml(money(details.subtotal))}</td></tr>
                <tr><td style="padding:6px 0;color:${MUTED};">Shipping — ${escapeHtml(shipLabel)}</td><td style="padding:6px 0;text-align:right;">${escapeHtml(money(details.shippingCost))}</td></tr>
                <tr><td style="padding:6px 0;color:${MUTED};">Tax</td><td style="padding:6px 0;text-align:right;">${escapeHtml(money(details.tax))}</td></tr>
                <tr><td style="padding:10px 0 0;border-top:1px solid ${LINE};font-weight:700;font-size:18px;">Total</td><td style="padding:10px 0 0;border-top:1px solid ${LINE};text-align:right;font-weight:700;font-size:18px;">${escapeHtml(money(details.total))}</td></tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${FOREST};font-weight:600;">Ship to</p>
              ${addressHtml}
              ${details.phone ? `<p style="margin:10px 0 0;color:${MUTED};font-size:14px;">Phone ${escapeHtml(details.phone)}</p>` : ""}
              <p style="margin:28px 0 0;text-align:center;">
                <a href="${escapeHtml(details.orderUrl)}" style="display:inline-block;background:${FOREST};color:#f7f3ea;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:600;">View your order</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
