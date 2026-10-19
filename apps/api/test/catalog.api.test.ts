import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";

const app = createApp();

async function ready() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const count = await prisma.product.count();
    return count > 0;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

describeLive("catalog API", () => {
  it("lists products with required fields and dual-unit dimensions", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const product = res.body.items[0];
    expect(product).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      price: expect.any(Number),
      stockQuantity: expect.any(Number),
    });
    expect(product.category.slug).toBeTruthy();
    expect(product.brand.slug).toBeTruthy();
    expect(product.images[0].url).toMatch(/\/api\/v1\/files\//);
    expect(product.weightKg).toBeGreaterThan(0);
    expect(product.weightLb).toBeGreaterThan(0);
    expect(product.dimensions.metric.lengthCm).toBeGreaterThan(0);
    expect(product.dimensions.imperial.lengthIn).toBeGreaterThan(0);
  });

  it("supports faceted filters and sorting", async () => {
    const audio = await request(app).get("/api/v1/products?category=audio&sort=price_asc");
    expect(audio.status).toBe(200);
    expect(audio.body.items.every((item: { category: { slug: string } }) => item.category.slug === "audio")).toBe(true);
    const prices = audio.body.items.map((item: { price: number }) => item.price);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
    expect(audio.body.facets.brands.length).toBeGreaterThan(0);
    expect(audio.body.facets.categories.length).toBeGreaterThan(0);
  });

  it("returns warranty, manufacturer links, and product information on a detail page", async () => {
    const res = await request(app).get("/api/v1/products/sony-wh-1000xm5");
    expect(res.status).toBe(200);
    expect(res.body.warrantyMonths).toBe(24);
    expect(res.body.warrantyNote).toMatch(/manufacturer/i);
    expect(res.body.manufacturerUrl).toMatch(/^https:\/\/www\.sony\.com/);
    expect(res.body.brandUrl).toMatch(/^https:\/\//);
    expect(res.body.modelCode).toBe("WH-1000XM5");
    expect(res.body.highlights).toMatch(/noise cancellation/i);
    expect(res.body.packageContents).toMatch(/carrying case/i);
    expect(res.body.attributes.length).toBeGreaterThan(2);
    expect(res.body.onPromotion).toBe(true);
    expect(res.body.sellingPrice).toBe(299.99);
    expect(res.body.lowestPrice30d).toBe(349.99);
    expect(res.body.promotions).toBeUndefined();
  });

  it("returns typeahead suggestions", async () => {
    const res = await request(app).get("/api/v1/search/suggest?q=sony");
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it("serves a product image", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { config } = await import("../src/config.js");
    mkdirSync(config.uploadDir, { recursive: true });
    writeFileSync(`${config.uploadDir}/catalog-test.svg`, "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const image = await request(app).get("/api/v1/files/catalog-test.svg");
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toMatch(/image|svg/);
  });
});
