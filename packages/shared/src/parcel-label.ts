import { carrierName, type ShippingCarrier } from "./shipping.js";

export const VOLT_WAREHOUSE_LABEL = {
  name: "Volt & Co warehouse",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "Finland",
};

export type ParcelAddress = {
  recipientName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
  countryName?: string;
};

export type ParcelLabelDetails = {
  reference: string;
  carrier: ShippingCarrier | string;
  trackingCode: string;
  shippingMethod?: string;
  recipient: ParcelAddress | null;
};

export function suggestDemoTracking(carrier: ShippingCarrier, reference: string) {
  const stamp = reference.replaceAll(/\W/g, "").slice(-10).toUpperCase() || "DEMO";
  if (carrier === "posti") return `JJFI${stamp.padStart(16, "0")}`;
  if (carrier === "postnord") return `00TEST${stamp}SE`;
  return `BUD-DEV-${stamp}`;
}

export function formatParcelAddress(address: ParcelAddress | null | undefined) {
  if (!address) return [];
  return [
    address.recipientName,
    address.line1,
    address.line2,
    [address.postal, address.city].filter(Boolean).join(" "),
    address.region,
    address.countryName || address.country,
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function trackingBars(code: string) {
  const bits = [...code.toUpperCase()].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1, (n >> 2) & 1, 1, (n >> 1) & 1, n & 1, 0];
  });
  let x = 8;
  const rects = bits
    .map((bit) => {
      const width = bit ? 2.2 : 1.1;
      const rect = bit ? `<rect x="${x.toFixed(1)}" y="4" width="${width}" height="46"/>` : "";
      x += width + 1.1;
      return rect;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bars" viewBox="0 0 ${Math.ceil(x + 8)} 54" preserveAspectRatio="xMidYMid meet">${rects}</svg>`;
}

export function parcelLabelHtml(details: ParcelLabelDetails) {
  const sender = [
    VOLT_WAREHOUSE_LABEL.name,
    VOLT_WAREHOUSE_LABEL.line1,
    `${VOLT_WAREHOUSE_LABEL.postal} ${VOLT_WAREHOUSE_LABEL.city}`,
    VOLT_WAREHOUSE_LABEL.country,
  ];
  const recipient = formatParcelAddress(details.recipient);
  const service = details.shippingMethod === "express" ? "Express" : "Standard";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Parcel label ${escapeHtml(details.reference)}</title>
  <style>
    @page { size: A5 portrait; margin: 0; }
    html, body { width: 148mm; height: 210mm; margin: 0; overflow: hidden; background: #fff; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; }
    .label {
      width: 148mm;
      height: 210mm;
      box-sizing: border-box;
      padding: 12mm 14mm;
      display: grid;
      align-content: start;
      gap: 12px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .kicker { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #555; margin: 0 0 4px; }
    .block { margin: 0; font-size: 15px; line-height: 1.35; }
    .to { font-size: 20px; font-weight: 700; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 0.04em; font-size: 14px; word-break: break-all; }
    .bars { display: block; width: 100%; height: 48px; margin: 8px 0 6px; }
    .note { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; color: #555; margin: 0; }
    h1 { font-size: 26px; margin: 0 0 4px; }
    @media print {
      html, body, .label { width: 148mm; height: 210mm; overflow: hidden; }
    }
  </style>
</head>
<body>
  <article class="label">
    <div>
      <h1>${escapeHtml(carrierName(details.carrier))}</h1>
      <p class="note">${escapeHtml(service)} parcel · ${escapeHtml(details.reference)}</p>
    </div>
    <div>
      <p class="kicker">From</p>
      <p class="block">${sender.map(escapeHtml).join("<br />")}</p>
    </div>
    <div>
      <p class="kicker">To</p>
      <p class="block to">${recipient.length ? recipient.map(escapeHtml).join("<br />") : "Address unavailable"}</p>
    </div>
    <div>
      <p class="kicker">Tracking</p>
      ${trackingBars(details.trackingCode)}
      <p class="block code">${escapeHtml(details.trackingCode)}</p>
    </div>
    <p class="note">Demo warehouse label. Not a live ${escapeHtml(carrierName(details.carrier))} shipment.</p>
  </article>
  <script>window.addEventListener("load", () => window.print());</script>
</body>
</html>`;
}
