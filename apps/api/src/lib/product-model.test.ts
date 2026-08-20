import { describe, expect, it } from "vitest";
import { productSchema } from "@volt/shared";

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
});
