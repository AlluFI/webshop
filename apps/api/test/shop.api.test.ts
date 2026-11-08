import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import { formatOrderReference } from "@volt/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { setStripeClientForTests } from "../src/lib/stripe.js";

const app = createApp();
const webhookSecret = "whsec_test";

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
  recipientName: "Lookup Customer",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "FI",
  phone: "+358401234567",
};

describeLive("shop extras API", () => {
  const email = `shop-extras-${Date.now()}@volt.test`;
  const create = vi.fn();
  const retrieve = vi.fn();
  const cancelIntent = vi.fn().mockResolvedValue({});
  let productId = "";
  let soldOutId = "";
  let originalStock = 0;
  let soldOutStock = 0;
  let accessToken = "";

  beforeAll(async () => {
    const product = await prisma.product.findFirstOrThrow({
      orderBy: { stockQuantity: "desc" },
    });
    productId = product.id;
    originalStock = product.stockQuantity;
    const soldOut = await prisma.product.findFirstOrThrow({
      where: { id: { not: productId } },
      orderBy: { stockQuantity: "asc" },
    });
    soldOutId = soldOut.id;
    soldOutStock = soldOut.stockQuantity;
    await prisma.product.update({ where: { id: soldOutId }, data: { stockQuantity: 0 } });
    await prisma.shippingOption.upsert({
      where: { code: "pickup" },
      update: { active: true, price: 0, minDays: 0, maxDays: 1 },
      create: {
        code: "pickup",
        name: "Pickup",
        description: "Collect from our Helsinki warehouse",
        price: 0,
        minDays: 0,
        maxDays: 1,
        active: true,
        sortOrder: 2,
      },
    });

    setStripeClientForTests({
      paymentIntents: { create, retrieve, cancel: cancelIntent },
    } as unknown as Stripe);

    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Lookup Customer",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({ token: register.body.verifyToken });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    setStripeClientForTests(null);
    if (productId) {
      await prisma.product.update({
        where: { id: productId },
        data: { stockQuantity: originalStock },
      });
    }
    if (soldOutId) {
      await prisma.product.update({
        where: { id: soldOutId },
        data: { stockQuantity: soldOutStock },
      });
      await prisma.stockAlert.deleteMany({ where: { productId: soldOutId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("exposes i18n config defaulting to English-only", async () => {
    const res = await request(app).get("/api/v1/shop/config");
    expect(res.status).toBe(200);
    expect(res.body.locales).toEqual(["en", "fi", "sv"]);
    expect(res.body.defaultLocale).toBe("en");
  });

  it("saves and removes a wishlist item for the signed-in customer", async () => {
    const added = await request(app)
      .post("/api/v1/wishlist")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId });
    expect(added.status).toBe(201);
    expect(added.body.items.some((item: { id: string }) => item.id === productId)).toBe(true);
    const listed = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    const removed = await request(app)
      .delete(`/api/v1/wishlist/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.items.some((item: { id: string }) => item.id === productId)).toBe(false);
  });

  it("accepts a back-in-stock alert and emails when warehouse stock returns", async () => {
    const alert = await request(app).post("/api/v1/stock-alerts").send({
      productId: soldOutId,
      email: "restock@volt.test",
    });
    expect(alert.status).toBe(201);
    const { shopService } = await import("../src/services/shop.service.js");
    const notified = await shopService.notifyRestock(soldOutId, 0, 4);
    expect(notified.sent).toBeGreaterThan(0);
    const row = await prisma.stockAlert.findFirst({
      where: { productId: soldOutId },
    });
    expect(row?.notifiedAt).toBeTruthy();
  });

  it("quotes pickup shipping and looks up a guest order by VC- and last name", async () => {
    const options = await request(app).get("/api/v1/shipping");
    expect(options.status).toBe(200);
    expect(options.body.items.some((row: { code: string }) => row.code === "pickup")).toBe(true);

    create.mockResolvedValueOnce({
      id: "pi_lookup",
      client_secret: "pi_lookup_secret",
      status: "requires_payment_method",
    });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId, quantity: 1 });
    const placed = await agent.post("/api/v1/checkout/place").send({
      email: "guest-lookup@volt.test",
      displayName: "Lookup Customer",
      phone: address.phone,
      shippingMethod: "pickup",
      address,
    });
    expect(placed.status).toBe(201);
    expect(placed.body.order.shippingMethod).toBe("pickup");
    const orderId = placed.body.order.id as string;
    const reference = formatOrderReference(orderId);

    const missed = await request(app).post("/api/v1/orders/lookup").send({
      reference,
      lastName: "Wrongname",
    });
    expect(missed.status).toBe(404);

    const found = await request(app).post("/api/v1/orders/lookup").send({
      reference,
      lastName: "Customer",
    });
    expect(found.status).toBe(200);
    expect(found.body.order.id).toBe(orderId);
    expect(found.body.orderAccessToken).toBeTruthy();

    const payload = JSON.stringify({
      id: "evt_pi_lookup",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_lookup",
          object: "payment_intent",
          status: "succeeded",
          metadata: { orderId },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("stripe-signature", signature)
      .set("content-type", "application/json")
      .send(payload);

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "DELIVERED" },
    });
    const returned = await request(app)
      .post(`/api/v1/orders/${orderId}/return`)
      .set("X-Order-Token", found.body.orderAccessToken as string)
      .send({ reason: "changed_mind" });
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe("CLAIMS");
  });
});
