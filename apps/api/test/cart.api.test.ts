import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";

const app = createApp();

async function ready() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    const count = await prisma.product.count();
    return count > 0;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

async function registerAndLogin(email: string) {
  const register = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "Shopping123",
    captchaToken: "test-captcha-token",
  });
  await request(app).post("/api/v1/auth/verify-email").send({
    token: register.body.verifyToken,
  });
  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Shopping123",
  });
  return login.body.accessToken as string;
}

describeLive("cart API", () => {
  const email = `cart-${Date.now()}@volt.test`;
  const emails = [email, `cart-merge-${Date.now()}@volt.test`];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => undefined);
  });

  it("lets a guest add, persist, update, and refuse overselling", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { stockQuantity: { gte: 2 } },
      include: { images: true },
    });
    const agent = request.agent(app);

    const added = await agent.post("/api/v1/cart/items").send({
      productId: product.id,
      quantity: 1,
    });
    expect(added.status).toBe(201);
    expect(added.body.items).toHaveLength(1);
    expect(added.body.items[0].name).toBe(product.name);
    expect(added.body.items[0].price).toBeGreaterThan(0);
    expect(added.body.items[0].thumbnail).toMatch(/\/api\/v1\/files\//);
    expect(added.body.subtotal).toBe(added.body.items[0].lineTotal);
    expect(added.headers["set-cookie"]?.join(" ")).toMatch(/cart_token=/);

    const persisted = await agent.get("/api/v1/cart");
    expect(persisted.status).toBe(200);
    expect(persisted.body.items).toHaveLength(1);
    expect(persisted.body.guest).toBe(true);

    const updated = await agent
      .patch(`/api/v1/cart/items/${persisted.body.items[0].id}`)
      .send({ quantity: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body.items[0].quantity).toBe(2);
    expect(updated.body.itemCount).toBe(2);

    const tooMany = await agent.post("/api/v1/cart/items").send({
      productId: product.id,
      quantity: product.stockQuantity,
    });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatch(/stock/i);

    const originalStock = product.stockQuantity;
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 0 } });
    const out = await agent.post("/api/v1/cart/items").send({
      productId: product.id,
      quantity: 1,
    });
    expect(out.status).toBe(409);
    await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: originalStock },
    });

    const cleared = await agent.delete(`/api/v1/cart/items/${updated.body.items[0].id}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.items).toHaveLength(0);
  });

  it("merges a guest cart into the logged-in cart", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { stockQuantity: { gte: 3 } },
    });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId: product.id, quantity: 1 });

    const token = await registerAndLogin(emails[1]);
    const merged = await agent.get("/api/v1/cart").set("Authorization", `Bearer ${token}`);
    expect(merged.status).toBe(200);
    expect(merged.body.guest).toBe(false);
    expect(merged.body.items[0].productId).toBe(product.id);
    expect(merged.body.items[0].quantity).toBe(1);

    const again = await agent.get("/api/v1/cart").set("Authorization", `Bearer ${token}`);
    expect(again.body.items).toHaveLength(1);
  });

  it("keeps a logged-in cart across a new session", async () => {
    const product = await prisma.product.findFirstOrThrow();
    const token = await registerAndLogin(email);
    const added = await request(app)
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    expect(added.status).toBe(201);

    const otherClient = await request(app)
      .get("/api/v1/cart")
      .set("Authorization", `Bearer ${token}`);
    expect(otherClient.body.items).toHaveLength(1);
    expect(otherClient.body.guest).toBe(false);
  });

  it("recommends related products from the same category or brand", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { stockQuantity: { gte: 1 } },
    });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ productId: product.id, quantity: 1 });
    const related = await agent.get("/api/v1/cart/related");
    expect(related.status).toBe(200);
    expect(Array.isArray(related.body.items)).toBe(true);
    expect(related.body.items.every((item: { id: string }) => item.id !== product.id)).toBe(true);
    expect(related.body.items.length).toBeGreaterThan(0);
  });
});
