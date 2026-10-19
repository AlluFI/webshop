import { describe, expect, it } from "vitest";
import {
  FINLAND_VAT_RATE,
  isOnPromotion,
  netFromInclusive,
  productPricing,
  sellingPriceOf,
  vatFromInclusive,
  vatIncludedLabel,
} from "@volt/shared";

describe("Finnish inclusive VAT pricing", () => {
  it("splits a retail price into net and 25.5% VAT", () => {
    expect(netFromInclusive(125.5)).toBe(100);
    expect(vatFromInclusive(125.5)).toBe(25.5);
    expect(vatIncludedLabel()).toBe("VAT 25.5% (included)");
  });

  it("computes margin from net retail minus wholesale", () => {
    const pricing = productPricing(125.5, 70, FINLAND_VAT_RATE);
    expect(pricing.net).toBe(100);
    expect(pricing.vat).toBe(25.5);
    expect(pricing.margin).toBe(30);
    expect(pricing.marginPct).toBe(30);
  });

  it("uses the promotion price only inside the date frame", () => {
    const start = new Date("2026-10-01T00:00:00.000Z");
    const end = new Date("2026-10-15T23:59:59.000Z");
    expect(isOnPromotion(349.99, 299.99, start, end, new Date("2026-10-08T12:00:00.000Z"))).toBe(true);
    expect(isOnPromotion(349.99, 299.99, start, end, new Date("2026-09-30T12:00:00.000Z"))).toBe(false);
    expect(sellingPriceOf(349.99, 299.99, start, end, new Date("2026-10-08T12:00:00.000Z"))).toBe(299.99);
    expect(sellingPriceOf(349.99, 299.99, start, end, new Date("2026-10-16T12:00:00.000Z"))).toBe(349.99);
  });
});
