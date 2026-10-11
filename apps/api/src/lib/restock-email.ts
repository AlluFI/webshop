export type RestockEmailItem = {
  name: string;
  sku: string | null;
  quantity: number;
  stockOnHand: number;
};

export type RestockEmailDetails = {
  reference: string;
  wholesalerName: string;
  wholesalerEmail: string;
  contactName?: string | null;
  note?: string | null;
  items: RestockEmailItem[];
  warehouse: {
    name: string;
    line1: string;
    city: string;
    postal: string;
    country: string;
  };
};

const FOREST = "#1f3d34";
const INK = "#1b241f";
const MUTED = "#5c675f";
const PAPER = "#f4efe4";
const CARD = "#fffdf8";
const LINE = "#ddd4c4";

export const VOLT_WAREHOUSE = {
  name: "Volt & Co warehouse",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "Finland",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildRestockEmail(details: RestockEmailDetails) {
  const greeting = details.contactName ? `Hello ${details.contactName},` : "Hello,";
  const lines = details.items
    .map((item) => {
      const sku = item.sku ? ` (${item.sku})` : "";
      return `- ${item.name}${sku} × ${item.quantity}  (warehouse on hand: ${item.stockOnHand})`;
    })
    .join("\n");
  const text = [
    greeting,
    "",
    `Please supply the following to ${details.warehouse.name} for purchase order ${details.reference}.`,
    "",
    lines,
    "",
    details.note ? `Note from Volt & Co:\n${details.note}\n` : "",
    "Ship to:",
    details.warehouse.name,
    details.warehouse.line1,
    `${details.warehouse.postal} ${details.warehouse.city}`,
    details.warehouse.country,
    "",
    "Reply to this email to confirm availability and delivery date.",
    "",
    "Volt & Co",
  ]
    .filter((row) => row !== "")
    .join("\n");

  const rows = details.items
    .map(
      (item) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};color:${MUTED};">${escapeHtml(item.sku || "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};text-align:right;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};text-align:right;color:${MUTED};">${item.stockOnHand}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:${PAPER};color:${INK};font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
        <tr><td style="background:${FOREST};color:#f7f3ea;padding:20px 24px;">
          <p style="margin:0;letter-spacing:0.08em;font-size:12px;text-transform:uppercase;">Volt &amp; Co</p>
          <h1 style="margin:6px 0 0;font-size:24px;">Purchase order ${escapeHtml(details.reference)}</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 16px;color:${MUTED};">Please supply the lines below to our warehouse. This is a restock order from Volt &amp; Co.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${LINE};font-size:12px;color:${MUTED};">Product</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${LINE};font-size:12px;color:${MUTED};">SKU</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${LINE};font-size:12px;color:${MUTED};">Order</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${LINE};font-size:12px;color:${MUTED};">On hand</th>
            </tr>
            ${rows}
          </table>
          ${
            details.note
              ? `<p style="margin:16px 0 0;"><strong>Note</strong><br>${escapeHtml(details.note)}</p>`
              : ""
          }
          <p style="margin:20px 0 0;"><strong>Ship to</strong><br>
            ${escapeHtml(details.warehouse.name)}<br>
            ${escapeHtml(details.warehouse.line1)}<br>
            ${escapeHtml(details.warehouse.postal)} ${escapeHtml(details.warehouse.city)}<br>
            ${escapeHtml(details.warehouse.country)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return {
    subject: `Purchase order ${details.reference} from Volt & Co`,
    text,
    html,
  };
}
