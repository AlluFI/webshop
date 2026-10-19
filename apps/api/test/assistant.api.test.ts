import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as argon2 from "argon2";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { encrypt } from "../src/lib/crypto.js";
import { formatOrderReference } from "@volt/shared";

const app = createApp();

async function ready() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

describeLive("Voltie assistant", () => {
  const stamp = Date.now();
  const email = `voltie-${stamp}@volt.test`;
  const otherEmail = `voltie-other-${stamp}@volt.test`;
  let customerId = "";
  let accessToken = "";
  let orderId = "";

  afterAll(async () => {
    if (orderId) {
      await prisma.supportTicket.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => undefined);
    }
    await prisma.supportTicket.deleteMany({ where: { customerEmail: { in: [email, "guest@volt.test"] } } }).catch(() => undefined);
    await prisma.assistantThread.deleteMany({ where: { userId: customerId || undefined } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } }).catch(() => undefined);
  });

  it("answers guests from the catalog and will not look up someone else's order", { timeout: 15_000 }, async () => {
    const guestThread = await request(app).post("/api/v1/assistant/threads");
    expect(guestThread.status).toBe(201);
    const search = await request(app)
      .post(`/api/v1/assistant/threads/${guestThread.body.id}/messages`)
      .send({ content: "Do you sell Sony headphones?" });
    expect(search.status).toBe(201);
    expect(search.body.content.toLowerCase()).toMatch(/sony|product|catalog|have for|no catalog|could not find/);
    expect(search.body.content.toLowerCase()).not.toMatch(/for “are”|for "are"/);

    const category = await request(app)
      .post(`/api/v1/assistant/threads/${guestThread.body.id}/messages`)
      .send({ content: "What kind of headphones are available?" });
    expect(category.status).toBe(201);
    expect(category.body.content.toLowerCase()).toMatch(/audio|headphone|sony|bose|airpods|nothing/);
    expect(category.body.content.toLowerCase()).not.toMatch(/for “are”|for "are"/);
    expect(category.body.uiBlocks?.[0]?.type).toBe("products");
    expect(category.body.uiBlocks?.[0]?.items?.length).toBeGreaterThan(1);

    const orders = await request(app)
      .post(`/api/v1/assistant/threads/${guestThread.body.id}/messages`)
      .send({ content: "Where is my order VC-AAAAAAAA?" });
    expect(orders.status).toBe(201);
    expect(orders.body.content).toMatch(/Sign in/i);

    const ticket = await request(app)
      .post(`/api/v1/assistant/threads/${guestThread.body.id}/messages`)
      .send({ content: "Please email support about delayed shipping. Reply to guest@volt.test" });
    expect(ticket.status).toBe(201);
    expect(ticket.body.content).toMatch(/VD-/);
    expect(ticket.body.content).toMatch(/VOLT-/);
    expect(ticket.body.uiBlocks?.[0]?.type).toBe("ticket");
  });

  it("lets a customer confirm a claim on their own order only", { timeout: 15_000 }, async () => {
    const role = await prisma.role.upsert({
      where: { name: "customer" },
      update: {},
      create: { name: "customer" },
    });
    const user = await prisma.user.create({
      data: {
        email,
        displayName: "Voltie Customer",
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        roleId: role.id,
      },
    });
    customerId = user.id;
    const other = await prisma.user.create({
      data: {
        email: otherEmail,
        displayName: "Other",
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        roleId: role.id,
      },
    });
    const product = await prisma.product.findFirst({ select: { id: true, name: true, barcode: true } });
    if (!product) return;
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        status: "PAID",
        currency: "EUR",
        subtotal: 10,
        shippingCost: 0,
        tax: 2,
        total: 12,
        shippingMethod: "standard",
        contactEmailEnc: encrypt(email),
        contactNameEnc: encrypt("Voltie Customer"),
        shippingAddressEnc: encrypt("{}"),
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: 10,
            lineTotal: 10,
            barcode: product.barcode,
          },
        },
      },
    });
    orderId = order.id;

    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Shopping123" });
    expect(login.status).toBe(200);
    accessToken = login.body.accessToken;

    const mine = await request(app)
      .post("/api/v1/assistant/threads")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(mine.status).toBe(201);

    const latest = await request(app)
      .post(`/api/v1/assistant/threads/${mine.body.id}/messages`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "Show my latest order" });
    expect(latest.status).toBe(201);
    expect(latest.body.content).toMatch(/latest order/i);
    expect(latest.body.content).toContain(formatOrderReference(order.id));
    expect(latest.body.content).not.toMatch(/I’m Voltie|I'm Voltie/);

    const typo = await request(app)
      .post(`/api/v1/assistant/threads/${mine.body.id}/messages`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "Shoe my latest oder" });
    expect(typo.status).toBe(201);
    expect(typo.body.content).toMatch(/latest order|“oder”|oder/i);
    expect(typo.body.content).toContain(formatOrderReference(order.id));
    expect(typo.body.content).not.toMatch(/I’m Voltie|I'm Voltie/);

    const stolen = await request(app)
      .get(`/api/v1/assistant/threads/${mine.body.id}/messages`)
      .set("Authorization", `Bearer ${(await request(app).post("/api/v1/auth/login").send({ email: otherEmail, password: "Shopping123" })).body.accessToken}`);
    expect(stolen.status).toBe(404);

    const claimChat = await request(app)
      .post(`/api/v1/assistant/threads/${mine.body.id}/messages`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: `The box for ${formatOrderReference(order.id)} arrived damaged` });
    expect(claimChat.status).toBe(201);
    expect(claimChat.body.uiBlocks?.[0]?.type).toBe("confirm_claim");

    const confirmed = await request(app)
      .post(`/api/v1/assistant/threads/${mine.body.id}/claim`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ orderId: order.id, reason: "Carton crushed, headphones scratched." });
    expect(confirmed.status).toBe(201);
    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloaded?.status).toBe("CLAIMS");
    expect(confirmed.body.ticket.externalKey).toMatch(/^VOLT-/);

    await prisma.user.delete({ where: { id: other.id } }).catch(() => undefined);
  });
});
