import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { encrypt, encryptJson } from "../src/lib/crypto.js";

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

describeLive("reviews API", () => {
  const email = `reviewer-${Date.now()}@volt.test`;
  let userId = "";
  let accessToken = "";
  let productId = "";
  let productSlug = "";
  let reviewId = "";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("rejects reviews without a purchase, then accepts after a paid order", { timeout: 15_000 }, async () => {
    const product = await prisma.product.findFirst({ where: { slug: "sony-wh-1000xm5" } });
    expect(product).toBeTruthy();
    productId = product!.id;
    productSlug = product!.slug;

    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Reviewer",
      captchaToken: "test-captcha-token",
    });
    expect(register.status).toBe(201);
    await request(app).post("/api/v1/auth/verify-email").send({ token: register.body.verifyToken });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    accessToken = login.body.accessToken;
    userId = login.body.userId;

    const blocked = await request(app)
      .post(`/api/v1/products/${productSlug}/reviews`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ stars: 5, body: "This should not work because I have not bought it yet." });
    expect(blocked.status).toBe(403);

    const role = await prisma.role.findUnique({ where: { name: "customer" } });
    const purchase = await prisma.order.create({
      data: {
        userId,
        status: "PAID",
        subtotal: 10,
        shippingCost: 0,
        tax: 0,
        total: 10,
        shippingMethod: "standard",
        contactEmailEnc: encrypt(email),
        contactNameEnc: encrypt("Reviewer"),
        shippingAddressEnc: encryptJson({
          recipientName: "Reviewer",
          line1: "Test 1",
          city: "Helsinki",
          postal: "00100",
          country: "FI",
        }),
        items: {
          create: {
            productId,
            productName: product!.name,
            quantity: 1,
            unitPrice: 10,
            lineTotal: 10,
          },
        },
        events: { create: { status: "PAID" } },
      },
    });
    expect(role?.name).toBe("customer");

    const eligible = await request(app)
      .get(`/api/v1/products/${productSlug}/reviews/eligibility`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(eligible.status).toBe(200);
    expect(eligible.body.canReview).toBe(true);
    expect(eligible.body.orderId).toBe(purchase.id);

    const detail = await request(app)
      .get(`/api/v1/orders/${purchase.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.items.some((item: { canReview?: boolean }) => item.canReview)).toBe(true);

    const created = await request(app)
      .post(`/api/v1/products/${productSlug}/reviews`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ stars: 5, body: "Quiet on the tram and comfortable for long calls." });
    expect(created.status).toBe(201);
    reviewId = created.body.review.id;
    expect(created.body.product.count).toBeGreaterThan(0);

    const list = await request(app).get(`/api/v1/products/${productSlug}/reviews?sort=helpful`);
    expect(list.status).toBe(200);
    expect(list.body.items[0].helpfulCount).toBeGreaterThanOrEqual(list.body.items.at(-1)?.helpfulCount ?? 0);

    const vote = await request(app)
      .post(`/api/v1/reviews/${reviewId}/vote`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(vote.status).toBe(200);
    expect(vote.body.helpfulCount).toBeGreaterThanOrEqual(1);

    const afterReview = await request(app)
      .get(`/api/v1/orders/${purchase.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(afterReview.body.items.every((item: { canReview?: boolean }) => !item.canReview)).toBe(true);
  });
});
