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
  recipientName: "Pay Customer",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "FI",
  phone: "+358401234567",
};

const checkoutBody = {
  email: "pay@volt.test",
  displayName: "Pay Customer",
  phone: "+358401234567",
  shippingMethod: "standard" as const,
  address,
};

describeLive("Stripe checkout", () => {
  let productId = "";
  let originalStock = 0;
  const create = vi.fn();
  const retrieve = vi.fn();

  beforeAll(async () => {
    const product = await prisma.product.findFirstOrThrow({
      orderBy: { stockQuantity: "desc" },
    });
    productId = product.id;
    originalStock = product.stockQuantity;
    setStripeClientForTests({
      paymentIntents: { create, retrieve, cancel: vi.fn().mockResolvedValue({}) },
      refunds: { create: vi.fn().mockResolvedValue({ id: "re_test" }) },
    } as unknown as Stripe);
  });

  afterAll(async () => {
    setStripeClientForTests(null);
    if (productId) {
      await prisma.product.update({
        where: { id: productId },
        data: { stockQuantity: originalStock },
      });
    }
    await prisma.order.deleteMany({
      where: { payment: { stripePaymentIntentId: { in: ["pi_test_success", "pi_test_fail", "pi_test_user"] } } },
    }).catch(() => undefined);
  });

  it("exposes checkout config", async () => {
    const res = await request(app).get("/api/v1/checkout/config");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.publishableKey).toMatch(/^pk_/);
  });

  it("simulates a payment-provider timeout without reserving stock", async () => {
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId, quantity: 1 });
    const timedOut = await agent
      .post("/api/v1/checkout/place")
      .set("x-volt-simulate", "stripe-timeout")
      .send(checkoutBody);
    expect(timedOut.status).toBe(504);
    expect(timedOut.body.fields.payment).toMatch(/timeout/i);
    const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    expect(stockAfter).toBe(stockBefore);
  });

  it("places an order, decrements stock, and marks paid from a signed webhook", async () => {
    create.mockResolvedValueOnce({
      id: "pi_test_success",
      client_secret: "pi_test_success_secret",
      status: "requires_payment_method",
    });
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId, quantity: 1 });
    const placed = await agent.post("/api/v1/checkout/place").send(checkoutBody);
    expect(placed.status).toBe(201);
    expect(placed.body.clientSecret).toBe("pi_test_success_secret");
    expect(placed.body.order.status).toBe("PENDING_PAYMENT");
    const orderId = placed.body.order.id as string;
    const stockHeld = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    expect(stockHeld).toBe(stockBefore - 1);

    const payload = JSON.stringify({
      id: "evt_success",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_success",
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

    const token = placed.body.orderAccessToken as string;
    const order = await request(app).get(`/api/v1/checkout/orders/${orderId}`).set("x-order-token", token);
    expect(order.status).toBe(200);
    expect(order.body.status).toBe("PAID");
    expect(order.body.paymentStatus).toBe("SUCCEEDED");
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(stored.shippingAddressEnc).not.toContain("Helsinki");
    const stockPaid = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    expect(stockPaid).toBe(stockBefore - 1);
  });

  it("restores stock when Stripe reports a declined card", async () => {
    create.mockResolvedValueOnce({
      id: "pi_test_fail",
      client_secret: "pi_test_fail_secret",
      status: "requires_payment_method",
    });
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId, quantity: 1 });
    const placed = await agent.post("/api/v1/checkout/place").send({
      ...checkoutBody,
      email: "fail@volt.test",
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id as string;
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(
      stockBefore - 1,
    );
    const emptied = await agent.get("/api/v1/cart");
    expect(emptied.body.items).toHaveLength(0);

    const payload = JSON.stringify({
      id: "evt_fail",
      object: "event",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_test_fail",
          object: "payment_intent",
          status: "requires_payment_method",
          metadata: { orderId },
          last_payment_error: { message: "Your card has insufficient funds." },
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

    const token = placed.body.orderAccessToken as string;
    const order = await request(app).get(`/api/v1/checkout/orders/${orderId}`).set("x-order-token", token);
    expect(order.body.status).toBe("PAYMENT_FAILED");
    const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
    expect(stockAfter).toBe(stockBefore);
    const restored = await agent.get("/api/v1/cart");
    expect(
      restored.body.items.some(
        (item: { productId: string; quantity: number }) => item.productId === productId && item.quantity >= 1,
      ),
    ).toBe(true);
  });

  it("lets only one of two concurrent checkouts take the last unit", async () => {
    create.mockImplementation(() =>
      Promise.resolve({
        id: `pi_oversell_${Math.random().toString(16).slice(2)}`,
        client_secret: "pi_oversell_secret",
        status: "requires_payment_method",
      }),
    );
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    await prisma.product.update({ where: { id: productId }, data: { stockQuantity: 1 } });
    try {
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      await agentA.post("/api/v1/cart/items").send({ productId, quantity: 1 });
      await agentB.post("/api/v1/cart/items").send({ productId, quantity: 1 });
      const [first, second] = await Promise.all([
        agentA.post("/api/v1/checkout/place").send({ ...checkoutBody, email: "race-a@volt.test" }),
        agentB.post("/api/v1/checkout/place").send({ ...checkoutBody, email: "race-b@volt.test" }),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
      const winner = first.status === 201 ? first : second;
      const stock = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity;
      expect(stock).toBe(0);
      expect(stock).toBeGreaterThanOrEqual(0);
      await prisma.order.delete({ where: { id: winner.body.order.id } }).catch(() => undefined);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { stockQuantity: product.stockQuantity },
      });
    }
  });

  it("checks out a registered user and lists the paid order", async () => {
    create.mockResolvedValueOnce({
      id: "pi_test_user",
      client_secret: "pi_test_user_secret",
      status: "requires_payment_method",
    });
    const email = `paid-user-${Date.now()}@volt.test`;
    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Paid User",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({ token: register.body.verifyToken });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    const token = login.body.accessToken as string;
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").set("Authorization", `Bearer ${token}`).send({ productId, quantity: 1 });
    const placed = await agent
      .post("/api/v1/checkout/place")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...checkoutBody, email, displayName: "Paid User" });
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id as string;
    const payload = JSON.stringify({
      id: "evt_user_paid",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_user",
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
    const listed = await request(app)
      .get("/api/v1/orders?status=PAID")
      .set("Authorization", `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === orderId)).toBe(true);
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });
});
