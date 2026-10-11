import {
  EXPRESS_SHIPPING,
  FREE_STANDARD_THRESHOLD,
  STANDARD_SHIPPING,
  vatFromInclusive,
} from "@volt/shared";

export { EXPRESS_SHIPPING, FREE_STANDARD_THRESHOLD, STANDARD_SHIPPING };

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toCents(amount: number) {
  return Math.round(roundMoney(amount) * 100);
}

export function lineTotal(unitPrice: number, quantity: number) {
  return roundMoney(unitPrice * quantity);
}

export function cartSubtotal(lines: { unitPrice: number; quantity: number }[]) {
  return roundMoney(lines.reduce((sum, line) => sum + lineTotal(line.unitPrice, line.quantity), 0));
}

export function shippingCost(method: "standard" | "express", subtotal: number) {
  if (method === "express") return EXPRESS_SHIPPING;
  if (subtotal >= FREE_STANDARD_THRESHOLD) return 0;
  return STANDARD_SHIPPING;
}

/** Retail prices include VAT. This extracts the included VAT for the confirmation line. */
export function taxAmount(subtotal: number, shipping = 0) {
  return vatFromInclusive(subtotal + shipping);
}

export function orderTotal(subtotal: number, shipping: number, _tax = 0) {
  return roundMoney(subtotal + shipping);
}

export function clampQuantity(desired: number, stock: number) {
  if (stock <= 0) return 0;
  if (desired < 1) return 0;
  return Math.min(desired, stock);
}
