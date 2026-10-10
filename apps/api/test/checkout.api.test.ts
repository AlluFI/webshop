import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { decrypt } from "../src/lib/crypto.js";

const app = createApp();

async function ready() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    return (await prisma.product.count()) > 0;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

const address = {
  recipientName: "Demo Customer",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "FI",
  phone: "+358401234567",
};

describeLive("checkout API", () => {
  const email = `checkout-${Date.now()}@volt.test`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("quotes shipping from the cart and rejects an empty cart", async () => {
    const empty = await request(app).post("/api/v1/checkout/quote").send({
      shippingMethod: "standard",
    });
    expect(empty.status).toBe(400);

    const product = await prisma.product.findFirstOrThrow();
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId: product.id, quantity: 1 });

    const quote = await agent.post("/api/v1/checkout/quote").send({
      shippingMethod: "standard",
      address,
    });
    expect(quote.status).toBe(200);
    expect(quote.body.items).toHaveLength(1);
    expect(quote.body.subtotal).toBeGreaterThan(0);
    expect(quote.body.total).toBe(quote.body.subtotal + quote.body.shippingCost);
    expect(quote.body.address.city).toBe("Helsinki");
  });

  it("validates checkout fields and prefills a signed-in user", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Checkout Tes",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({
      token: register.body.verifyToken,
    });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    const token = login.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...address, label: "Home", isDefault: true });
    expect(created.status).toBe(201);
    const stored = await prisma.address.findFirstOrThrow({ where: { id: created.body.id } });
    expect(stored.cityEnc.startsWith("v1:")).toBe(true);
    expect(stored.cityEnc).not.toContain("Helsinki");
    expect(decrypt(stored.cityEnc)).toBe("Helsinki");

    const prefill = await request(app)
      .get("/api/v1/checkout/prefill")
      .set("Authorization", `Bearer ${token}`);
    expect(prefill.status).toBe(200);
    expect(prefill.body.email).toBe(email);
    expect(prefill.body.defaultAddress.postal).toBe("00100");

    const product = await prisma.product.findFirstOrThrow();
    await request(app)
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const missing = await request(app)
      .post("/api/v1/checkout/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "bad",
        displayName: "",
        phone: "1",
        shippingMethod: "standard",
      });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.email).toBeTruthy();

    const badPostal = await request(app)
      .post("/api/v1/checkout/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email,
        displayName: "Checkout Tes",
        phone: "+358401234567",
        shippingMethod: "express",
        address: { ...address, postal: "nope" },
      });
    expect(badPostal.status).toBe(400);
    expect(JSON.stringify(badPostal.body.fields)).toMatch(/postcode/i);

    const ok = await request(app)
      .post("/api/v1/checkout/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email,
        displayName: "Checkout Tes",
        phone: "+358401234567",
        shippingMethod: "express",
        addressId: created.body.id,
      });
    expect(ok.status).toBe(200);
    expect(ok.body.ready).toBe(true);
    expect(ok.body.shippingCost).toBe(18);
  });
});
