/** Standard Finnish VAT for electronics. Retail prices on the shop include this. */
export const FINLAND_VAT_RATE = 25.5;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function netFromInclusive(gross: number, vatRate = FINLAND_VAT_RATE) {
  return roundMoney(gross / (1 + vatRate / 100));
}

export function vatFromInclusive(gross: number, vatRate = FINLAND_VAT_RATE) {
  return roundMoney(gross - netFromInclusive(gross, vatRate));
}

export function productPricing(
  retail: number,
  wholesale: number | null | undefined,
  vatRate = FINLAND_VAT_RATE,
) {
  const rate = Number.isFinite(vatRate) ? vatRate : FINLAND_VAT_RATE;
  const net = netFromInclusive(retail, rate);
  const vat = vatFromInclusive(retail, rate);
  const cost = wholesale == null || Number.isNaN(Number(wholesale)) ? null : Number(wholesale);
  const margin = cost == null ? null : roundMoney(net - cost);
  const marginPct = margin == null || net === 0 ? null : roundMoney((margin / net) * 100);
  return { retail, wholesale: cost, vatRate: rate, net, vat, margin, marginPct };
}

export function vatIncludedLabel(rate = FINLAND_VAT_RATE) {
  return `VAT ${rate}% (included)`;
}

export const SALES_RANGES = [
  "last_7_days",
  "last_30_days",
  "last_12_months",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
] as const;

export const SALES_GROUPS = ["day", "week", "month", "year"] as const;

export type SalesRange = (typeof SALES_RANGES)[number];
export type SalesGroup = (typeof SALES_GROUPS)[number];
