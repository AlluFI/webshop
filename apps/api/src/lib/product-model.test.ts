import { describe, expect, it } from "vitest";
import {
  adminOrderStatusSchema,
  adminProductSchema,
  comparePickingPriority,
  ean13FromIndex,
  formatLocatorCode,
  formatOrderReference,
  formatOrderStatus,
  formatWarrantyLabel,
  linesFromText,
  locatorFromIndex,
  normalizeBarcode,
  productSchema,
  suggestedRestockQty,
} from "@volt/shared";

describe("product data model", () => {
  const valid = {
    id: "p1",
    name: "Sony WH-1000XM5",
    description: "Noise-cancelling headphones",
    price: 349.99,
    stockQuantity: 10,
    category: "Audio",
    brand: "Sony",
    images: ["sony.svg"],
    weightKg: 0.25,
    weightLb: 0.551,
    lengthCm: 19.5,
    widthCm: 16.5,
    heightCm: 8,
    lengthIn: 7.68,
    widthIn: 6.5,
    heightIn: 3.15,
  };

  it("accepts a product with required catalog fields including dual-unit dimensions", () => {
    expect(productSchema.parse(valid).name).toBe("Sony WH-1000XM5");
  });

  it("rejects missing images, negative price, and non-positive dimensions", () => {
    expect(
      productSchema.safeParse({ ...valid, images: [] }).success,
    ).toBe(false);
    expect(
      productSchema.safeParse({ ...valid, price: 0 }).success,
    ).toBe(false);
    expect(
      productSchema.safeParse({ ...valid, weightKg: -1 }).success,
    ).toBe(false);
  });

  it("prints warehouse locator codes as station|block|shelf|place", () => {
    expect(formatLocatorCode(1, 2, 2, 1)).toBe("01|02|2|1");
    expect(formatLocatorCode(12, 3, 10, 4)).toBe("12|03|10|4");
    expect(locatorFromIndex(0)).toEqual({
      locatorStation: 1,
      locatorBlock: 1,
      locatorShelf: 1,
      locatorPlace: 1,
    });
    expect(locatorFromIndex(5)).toEqual({
      locatorStation: 1,
      locatorBlock: 1,
      locatorShelf: 2,
      locatorPlace: 2,
    });
  });

  it("suggests a restock quantity only when warehouse stock is low", () => {
    expect(suggestedRestockQty(24)).toBe(0);
    expect(suggestedRestockQty(4)).toBe(16);
    expect(suggestedRestockQty(16)).toBe(0);
  });

  it("normalizes barcodes and builds a valid EAN-13", () => {
    expect(normalizeBarcode("640 000 000 001 9")).toBe("6400000000019");
    expect(ean13FromIndex(0)).toHaveLength(13);
    expect(ean13FromIndex(0)).toMatch(/^640000/);
  });

  it("prints the same uppercase VC- order number from a UUID", () => {
    expect(formatOrderReference("23aaa1b2-a575-482f-94c0-22c71db1631b")).toBe("VC-23AAA1B2");
  });

  it("lists express picking orders before standard, each oldest first", () => {
    const olderStandard = { shippingMethod: "standard", createdAt: "2026-10-01T08:00:00.000Z" };
    const newerStandard = { shippingMethod: "standard", createdAt: "2026-10-03T08:00:00.000Z" };
    const olderExpress = { shippingMethod: "express", createdAt: "2026-10-02T08:00:00.000Z" };
    const newerExpress = { shippingMethod: "express", createdAt: "2026-10-04T08:00:00.000Z" };
    expect(
      [newerStandard, newerExpress, olderStandard, olderExpress].sort(comparePickingPriority),
    ).toEqual([olderExpress, newerExpress, olderStandard, newerStandard]);
  });

  it("formats warranty and highlight lines for the product page", () => {
    expect(formatWarrantyLabel(24, "Manufacturer warranty")).toBe("24 months · Manufacturer warranty");
    expect(formatWarrantyLabel(1, null)).toBe("1 month");
    expect(linesFromText("- 8-mic ANC\n\n30-hour battery\n")).toEqual(["8-mic ANC", "30-hour battery"]);
  });

  it("accepts optional warranty, manufacturer links, and specs on admin product input", () => {
    const parsed = adminProductSchema.parse({
      name: "Sony WH-1000XM5",
      description: "Noise-cancelling headphones",
      price: 349.99,
      stockQuantity: 10,
      category: "audio",
      brand: "sony",
      weightKg: 0.25,
      lengthCm: 19.5,
      widthCm: 16.5,
      heightCm: 8,
      warrantyMonths: 24,
      warrantyNote: "Manufacturer warranty",
      manufacturerUrl: "https://www.sony.com/electronics/headband-headphones/wh-1000xm5",
      brandUrl: "https://www.sony.fi",
      modelCode: "WH-1000XM5",
      colorName: "Black",
      highlights: "8-mic ANC\n30-hour battery",
      attributes: [{ name: "Battery", value: "Up to 30 hours" }],
    });
    expect(parsed.warrantyMonths).toBe(24);
    expect(parsed.manufacturerUrl).toContain("sony.com");
    expect(adminProductSchema.safeParse({ ...parsed, manufacturerUrl: "sony.com" }).success).toBe(false);
    expect(adminProductSchema.safeParse({ ...parsed, promoPrice: 299.99 }).success).toBe(false);
    const promo = adminProductSchema.parse({
      ...parsed,
      promoPrice: 299.99,
      promoStartsAt: "2026-10-01T08:00",
      promoEndsAt: "2026-10-15T23:59",
    });
    expect(promo.promoPrice).toBe(299.99);
    expect(promo.promoStartsAt).toBeInstanceOf(Date);
    expect(adminProductSchema.safeParse({ ...parsed, promoPrice: 400, promoStartsAt: "2026-10-01T08:00", promoEndsAt: "2026-10-15T23:59" }).success).toBe(false);
  });

  it("labels warehouse and courier statuses for staff", () => {
    expect(formatOrderStatus("SHIPPING")).toBe("Shipping");
    expect(formatOrderStatus("WITH_COURIER")).toBe("With the courier");
    expect(formatOrderStatus("CLAIMS")).toBe("Claims");
    expect(adminOrderStatusSchema.safeParse({ status: "CLAIMS" }).success).toBe(false);
    expect(adminOrderStatusSchema.safeParse({ status: "CLAIMS", note: "Damaged on arrival" }).success).toBe(true);
  });
});
