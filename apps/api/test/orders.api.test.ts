import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import Stripe from "stripe";
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
  recipientName: "Order Customer",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "FI",
  phone: "+358401234567",
};

describeLive("orders API", () => {
  const email = `orders-${Date.now()}@volt.test`;
  const create = vi.fn();
  const retrieve = vi.fn();
  const cancelIntent = vi.fn().mockResolvedValue({});
  const refundCreate = vi.fn().mockResolvedValue({ id: "re_test" });
  let productId = "";
  let originalStock = 0;
  let accessToken = "";

  beforeAll(async () => {
    const product = await prisma.product.findFirstOrThrow({
      orderBy: { stockQuantity: "desc" },
    });
    productId = product.id;
    originalStock = product.stockQuantity;
    setStripeClientForTests({
      paymentIntents: { create, retrieve, cancel: cancelIntent },
      refunds: { create: refundCreate },
    } as unknown as Stripe);

    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Order Customer",
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
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  async function placeOrder(intentId: string) {
    create.mockResolvedValueOnce({
      id: intentId,
      client_secret: `${intentId}_secret`,
      status: "requires_payment_method",
    });
    const agent = request.agent(app);
    await agent
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId, quantity: 1 });
    const placed = await agent
      .post("/api/v1/checkout/place")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email,
        displayName: "Order Customer",
        phone: address.phone,
        shippingMethod: "standard",
        address,
      });
    expect(placed.status).toBe(201);
    return placed.body.order.id as string;
  }

  async function markPaid(orderId: string, intentId: string) {
    const payload = JSON.stringify({
      id: `evt_${intentId}`,
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: intentId,
          object: "payment_intent",
          status: "succeeded",
          metadata: { orderId },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const hook = await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("stripe-signature", signature)
      .set("content-type", "application/json")
      .send(payload);
    expect(hook.status).toBe(200);
  }

  it("cancels a pending order and restores stock", async () => {
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    const orderId = await placeOrder("pi_cancel");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(
      stockBefore - 1,
    );
    const cancelled = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.canCancel).toBe(false);
    expect(cancelIntent).toHaveBeenCalled();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(
      stockBefore,
    );
    const again = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(again.status).toBe(409);
  });

  it("filters orders by status and date, refunds a paid order, and restores stock", async () => {
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    const orderId = await placeOrder("pi_refund");
    await markPaid(orderId, "pi_refund");
    const today = new Date().toISOString().slice(0, 10);
    const listed = await request(app)
      .get(`/api/v1/orders?status=PAID&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === orderId)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(detail.body.shipping.city).toBe("Helsinki");
    expect(detail.body.events.length).toBeGreaterThan(1);
    expect(detail.body.canRefund).toBe(true);

    const refunded = await request(app)
      .post(`/api/v1/orders/${orderId}/refund`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(refunded.status).toBe(200);
    expect(refunded.body.status).toBe("REFUNDED");
    expect(refundCreate).toHaveBeenCalled();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(
      stockBefore,
    );
  });

  it("rejects listing orders without a session", async () => {
    const res = await request(app).get("/api/v1/orders");
    expect(res.status).toBe(401);
  });
});
