import { describe, expect, it } from "vitest";
import {
  cartSubtotal,
  clampQuantity,
  lineTotal,
  orderTotal,
  shippingCost,
  toCents,
} from "./cart-math.js";

describe("cart and order totals", () => {
  it("computes line and cart totals in cents-safe money", () => {
    expect(lineTotal(19.99, 3)).toBe(59.97);
    expect(cartSubtotal([{ unitPrice: 19.99, quantity: 2 }, { unitPrice: 10, quantity: 1 }])).toBe(
      49.98,
    );
  });

  it("applies free standard shipping over the threshold and express otherwise", () => {
    expect(shippingCost("standard", 40)).toBe(8);
    expect(shippingCost("standard", 150)).toBe(0);
    expect(shippingCost("express", 400)).toBe(18);
  });

  it("sums subtotal, shipping, and tax", () => {
    expect(orderTotal(40, 8, 0)).toBe(48);
  });

  it("clamps quantities to available stock", () => {
    expect(clampQuantity(5, 2)).toBe(2);
    expect(clampQuantity(2, 0)).toBe(0);
    expect(clampQuantity(0, 8)).toBe(0);
  });

  it("converts euros to integer cents for Stripe", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(349.99)).toBe(34999);
  });
});
