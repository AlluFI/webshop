import { describe, expect, it } from "vitest";
import {
  FINLAND_VAT_RATE,
  netFromInclusive,
  productPricing,
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
});
