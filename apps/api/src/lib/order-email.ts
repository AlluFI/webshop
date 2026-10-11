import { formatStoreDateLong, FREE_STANDARD_THRESHOLD, STORE_CURRENCY } from "@volt/shared";

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
  failureReason?: string;
  cartUrl?: string;
};

export type OrderShippedEmailDetails = OrderEmailDetails & {
  carrier: string;
  carrierName: string;
  trackingCode: string;
  trackingUrl: string;
  carrierPages: { name: string; url: string }[];
  estimatedDeliveryLabel: string;
  estimatedDeliveryFrom: string;
  estimatedDeliveryTo: string;
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
  return formatStoreDateLong(date);
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

  const failed = details.status === "PAYMENT_FAILED" || Boolean(details.failureReason);
  const reason = details.failureReason || "The card was declined.";
  const subject = failed
    ? `Volt & Co order ${ref} — payment did not go through`
    : `Your Volt & Co order ${ref} is confirmed`;
  const kicker = failed ? "Payment failed" : "Order confirmation";
  const introText = failed
    ? `${reason}\n\nNothing was charged. The items have been returned to the cart.`
    : "Thanks for your order. We have received your payment and are getting it ready.";
  const introHtml = failed
    ? `${escapeHtml(reason)} Nothing was charged. The items have been returned to the cart.`
    : "We received your payment and your order is confirmed. A summary is below — you can track status any time from your account.";
  const statusColor = failed ? "#9b2c2c" : FOREST;

  const itemText = details.items
    .map(
      (item) =>
        `- ${item.name} ×${item.quantity}  ${money(item.lineTotal)}  (${money(item.unitPrice)} each)`,
    )
    .join("\n");

  const text = [
    `Hi ${details.customerName || "there"},`,
    "",
    introText,
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
    details.cartUrl ? `Return to cart:\n${details.cartUrl}` : "",
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
              <div style="margin-top:8px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">${kicker}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:'Source Sans 3',Arial,sans-serif;font-size:16px;line-height:1.5;">
              <p style="margin:0 0 12px;font-size:22px;font-family:Georgia,serif;">${failed ? "Payment did not go through" : `Thanks, ${escapeHtml(details.customerName || "there")}.`}</p>
              <p style="margin:0 0 20px;color:${MUTED};">${introHtml}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${PAPER};border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;width:50%;vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Order</div>
                    <div style="margin-top:4px;font-weight:600;">${escapeHtml(ref)}</div>
                    <div style="margin-top:2px;font-size:13px;color:${MUTED};word-break:break-all;">${escapeHtml(details.orderId)}</div>
                  </td>
                  <td style="padding:14px 16px;width:50%;vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Status</div>
                    <div style="margin-top:4px;font-weight:600;color:${statusColor};">${escapeHtml(status)}</div>
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
                ${
                  details.cartUrl
                    ? `<a href="${escapeHtml(details.cartUrl)}" style="display:inline-block;margin-left:10px;background:transparent;color:${FOREST};text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:600;border:1px solid ${FOREST};">Return to cart</a>`
                    : ""
                }
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

export function buildOrderShippedEmail(details: OrderShippedEmailDetails) {
  const currency = details.currency || STORE_CURRENCY;
  const money = (value: number) => formatMoney(value, currency);
  const ref = shortId(details.orderId);
  const ship = details.shipping ? shippingLines(details.shipping) : [];
  const subject = `Your Volt & Co order ${ref} is on the way`;
  const eta =
    details.estimatedDeliveryFrom === details.estimatedDeliveryTo
      ? details.estimatedDeliveryLabel
      : `${details.estimatedDeliveryFrom} to ${details.estimatedDeliveryTo} (${details.estimatedDeliveryLabel})`;

  const itemText = details.items
    .map((item) => `- ${item.name} ×${item.quantity}  ${money(item.lineTotal)}`)
    .join("\n");

  const carrierPagesText = details.carrierPages
    .map((page) => `- ${page.name}: ${page.url}`)
    .join("\n");

  const text = [
    `Hi ${details.customerName || "there"},`,
    "",
    `Good news — order ${ref} has shipped with ${details.carrierName}.`,
    "",
    `Estimated delivery: ${eta}`,
    `Tracking number: ${details.trackingCode}`,
    `Track with ${details.carrierName}:\n${details.trackingUrl}`,
    `Track this order at Volt & Co:\n${details.orderUrl}`,
    "",
    "Carrier tracking pages (Finland)",
    carrierPagesText,
    "",
    "Items",
    itemText || "- (no items)",
    "",
    `Total: ${money(details.total)}`,
    ship.length ? ["Ship to", ...ship].join("\n") : "",
    "",
    "Volt & Co",
  ]
    .filter((block) => block !== "")
    .join("\n");

  const carrierLinks = details.carrierPages
    .map(
      (page) =>
        `<a href="${escapeHtml(page.url)}" style="color:${FOREST};">${escapeHtml(page.name)}</a>`,
    )
    .join(" · ");

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
              <div style="margin-top:8px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">Your order has shipped</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:'Source Sans 3',Arial,sans-serif;font-size:16px;line-height:1.5;">
              <p style="margin:0 0 12px;font-size:22px;font-family:Georgia,serif;">It's on the way, ${escapeHtml(details.customerName || "there")}.</p>
              <p style="margin:0 0 20px;color:${MUTED};">Order ${escapeHtml(ref)} left our warehouse with ${escapeHtml(details.carrierName)}. Estimated delivery is <strong style="color:${INK};">${escapeHtml(details.estimatedDeliveryLabel)}</strong> (${escapeHtml(details.estimatedDeliveryFrom)}–${escapeHtml(details.estimatedDeliveryTo)}).</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${PAPER};border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Tracking number</div>
                    <div style="margin-top:4px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(details.trackingCode)}</div>
                    <div style="margin-top:2px;font-size:13px;color:${MUTED};">${escapeHtml(details.carrierName)}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px;text-align:center;">
                <a href="${escapeHtml(details.trackingUrl)}" style="display:inline-block;background:${FOREST};color:#f7f3ea;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:600;">Track with ${escapeHtml(details.carrierName)}</a>
              </p>
              <p style="margin:0 0 22px;text-align:center;">
                <a href="${escapeHtml(details.orderUrl)}" style="color:${FOREST};font-weight:600;">View your order at Volt &amp; Co</a>
              </p>
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${FOREST};font-weight:600;">Carrier tracking (Finland)</p>
              <p style="margin:0 0 22px;color:${MUTED};font-size:14px;">${carrierLinks}</p>
              ${
                ship.length
                  ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${FOREST};font-weight:600;">Ship to</p>
              <p style="margin:0;color:${INK};line-height:1.5;">${ship.map(escapeHtml).join("<br />")}</p>`
                  : ""
              }
              <p style="margin:22px 0 0;color:${MUTED};font-size:14px;">Total ${escapeHtml(money(details.total))} · ${details.items.length} item${details.items.length === 1 ? "" : "s"}</p>
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
