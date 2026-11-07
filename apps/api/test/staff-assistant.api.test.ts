import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { DEMO_ADMIN_TOTP_SECRET, formatOrderReference } from "@volt/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { encrypt } from "../src/lib/crypto.js";

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

describeLive("Staff Voltie", () => {
  const stamp = Date.now();
  const adminEmail = `voltie-admin-${stamp}@volt.test`;
  const warehouseEmail = `voltie-wh-${stamp}@volt.test`;
  const supportEmail = `voltie-sup-${stamp}@volt.test`;
  const customerEmail = `voltie-staff-cust-${stamp}@volt.test`;
  const contactEmail = `buyer-${stamp}@volt.test`;
  const emails = [adminEmail, warehouseEmail, supportEmail, customerEmail];
  let orderId = "";
  let productName = "";

  afterAll(async () => {
    if (orderId) {
      await prisma.supportTicket.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => undefined);
    }
    await prisma.assistantThread.deleteMany({ where: { user: { email: { in: emails } } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => undefined);
  });

  async function makeStaff(email: string, roleName: string) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    await prisma.user.create({
      data: {
        email,
        displayName: roleName,
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        totpEnabled: true,
        roleId: role.id,
        totpSecret: { create: { secret: encrypt(DEMO_ADMIN_TOTP_SECRET), confirmedAt: new Date() } },
      },
    });
  }

  async function loginStaff(email: string) {
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Shopping123" });
    expect(login.status).toBe(200);
    const mfa = await request(app).post("/api/v1/auth/mfa/complete").send({
      mfaToken: login.body.mfaToken,
      totpCode: authenticator.generate(DEMO_ADMIN_TOTP_SECRET),
    });
    expect(mfa.status).toBe(200);
    return mfa.body.accessToken as string;
  }

  async function chat(token: string, content: string) {
    const thread = await request(app).post("/api/v1/assistant/threads").set("Authorization", `Bearer ${token}`);
    expect(thread.status).toBe(201);
    const reply = await request(app)
      .post(`/api/v1/assistant/threads/${thread.body.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content });
    expect(reply.status).toBe(201);
    return { threadId: thread.body.id as string, body: reply.body as { content: string; uiBlocks?: { type: string; title?: string; orderId?: string; status?: string; reason?: string; items?: { name: string }[] }[] } };
  }

  it("scopes lookups by role and confirms status without silent writes", { timeout: 30_000 }, async () => {
    const customerRole = await prisma.role.upsert({
      where: { name: "customer" },
      update: {},
      create: { name: "customer" },
    });
    await makeStaff(adminEmail, "admin");
    await makeStaff(warehouseEmail, "warehouse");
    await makeStaff(supportEmail, "support");
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        displayName: "Shopper",
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        roleId: customerRole.id,
      },
    });
    const product = await prisma.product.findFirst({
      select: { id: true, name: true, barcode: true },
    });
    if (!product) return;
    productName = product.name;
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        status: "PAID",
        currency: "EUR",
        subtotal: 10,
        shippingCost: 0,
        tax: 2,
        total: 12,
        shippingMethod: "standard",
        contactEmailEnc: encrypt(contactEmail),
        contactNameEnc: encrypt("Ada Buyer"),
        shippingAddressEnc: encrypt("{}"),
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: 10,
            lineTotal: 10,
            barcode: product.barcode,
            locatorCode: "01|02|2|1",
          },
        },
      },
    });
    orderId = order.id;
    const reference = formatOrderReference(order.id);

    const adminToken = await loginStaff(adminEmail);
    const warehouseToken = await loginStaff(warehouseEmail);
    const supportToken = await loginStaff(supportEmail);

    const adminOrder = await chat(adminToken, `Find order ${reference}`);
    expect(adminOrder.body.content).toContain(reference);
    expect(adminOrder.body.content).toMatch(/Paid/i);
    expect(adminOrder.body.content).toContain(contactEmail);
    expect(adminOrder.body.content).toContain("Ada Buyer");

    const warehouseOrder = await chat(warehouseToken, `Find order ${reference}`);
    expect(warehouseOrder.body.content).toContain(reference);
    expect(warehouseOrder.body.content).not.toContain(contactEmail);
    expect(warehouseOrder.body.content).not.toContain("Ada Buyer");

    const warehouseSales = await chat(warehouseToken, "Sales last week");
    expect(warehouseSales.body.content).toMatch(/cannot see sales/i);

    const warehouseTickets = await chat(warehouseToken, "Open tickets");
    expect(warehouseTickets.body.content).toMatch(/cannot see support tickets/i);

    const warehouseRefund = await chat(warehouseToken, `Refund ${reference}`);
    expect(warehouseRefund.body.content).toMatch(/cannot refund/i);
    expect(warehouseRefund.body.uiBlocks ?? []).toEqual([]);

    const adminSales = await chat(adminToken, "Sales last week");
    expect(adminSales.body.content).toMatch(/last 7 days/i);
    expect(adminSales.body.content).toMatch(/orders/i);

    const pick = await chat(warehouseToken, "What's on the pick list?");
    expect(pick.body.content).toContain(reference);
    expect(pick.body.content).toMatch(/01\|02\|2\|1/);
    expect(pick.body.content).not.toContain("Ada Buyer");

    const queue = await chat(warehouseToken, "how many unpicked order in queue?");
    expect(queue.body.content).toMatch(/unpicked order/i);
    expect(queue.body.content).toContain(reference);
    expect(queue.body.content).not.toMatch(/I’m Voltie for/i);

    const customerAsk = await chat(adminToken, `show me orders for user ${customerEmail}`);
    expect(customerAsk.body.content).toContain(customerEmail);
    expect(customerAsk.body.content).toContain(reference);
    expect(customerAsk.body.content).not.toMatch(/No customer matched/i);

    const gmailAsk = await chat(adminToken, "show me orders for user nobody@gmail.com");
    expect(gmailAsk.body.content).toMatch(/gmail\.com/i);
    expect(gmailAsk.body.content).not.toMatch(/email\.com/);

    const apple = await chat(adminToken, "Which is wholesaler for apple products?");
    expect(apple.body.content).not.toMatch(/I’m Voltie for/i);
    expect(apple.body.content).toMatch(/wholesaler|ElectroNordic|Baltic IT|No wholesaler/i);

    const supportApple = await chat(supportToken, "Which is wholesaler for apple products?");
    expect(supportApple.body.content).toMatch(/cannot see wholesalers/i);

    const locator = await chat(warehouseToken, `Where is ${productName}?`);
    expect(locator.body.content.toLowerCase()).toMatch(/locator|@ |stock/);

    const laptops = await chat(adminToken, "show laptops");
    expect(laptops.body.content).not.toMatch(/I’m Voltie for/i);
    expect(laptops.body.content.toLowerCase()).toMatch(/laptop|macbook|framework|match/i);
    const laptopBlocks = (laptops.body.uiBlocks ?? []).filter((block) => block.type === "products");
    const matchNames = (laptopBlocks[0]?.items ?? []).map((item: { name: string }) => item.name).join(" ");
    expect(matchNames).toMatch(/laptop|macbook|framework/i);
    expect(matchNames).not.toMatch(/power bank/i);

    const availableLaptops = await chat(adminToken, "Show available laptops");
    expect(availableLaptops.body.content).not.toMatch(/I’m Voltie for/i);
    expect(availableLaptops.body.content.toLowerCase()).toMatch(/laptop|macbook|framework/i);

    const watchLocator = await chat(warehouseToken, "what locator code for apple watch?");
    expect(watchLocator.body.content).toMatch(/Apple Watch/i);
    expect(watchLocator.body.content).not.toMatch(/No locator found/i);
    expect(watchLocator.body.content).not.toMatch(/code for apple watch/i);

    const watchBarcode = await chat(warehouseToken, "what is bar code for apple watch");
    expect(watchBarcode.body.content).toMatch(/Apple Watch/i);
    expect(watchBarcode.body.content).not.toMatch(/I’m Voltie for/i);

    const salesPhrase = await chat(adminToken, "list last 7 days sale");
    expect(salesPhrase.body.content).toMatch(/last 7 days/i);
    expect(salesPhrase.body.content).not.toMatch(/I’m Voltie for/i);

    const claims = await chat(adminToken, "show orders with claim");
    expect(claims.body.content).not.toMatch(/I’m Voltie for/i);
    expect(claims.body.content).toMatch(/claims/i);

    const originalStock = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity;
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 2 } });
    try {
      const lowStock = await chat(warehouseToken, "What products are low on stock?");
      expect(lowStock.body.content).toContain(product.name);
      expect(lowStock.body.content).toMatch(/2 on hand/);
      expect(lowStock.body.content).not.toMatch(/could not find/i);
      const supportStock = await chat(supportToken, "What products are low on stock?");
      expect(supportStock.body.content).toMatch(/cannot see product inventory/i);
    } finally {
      await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: originalStock } });
    }

    const courier = await chat(supportToken, `Hand ${reference} to the courier`);
    expect(courier.body.content).toMatch(/order handling/i);
    expect(courier.body.uiBlocks ?? []).toEqual([]);

    const refundOffer = await chat(supportToken, `Refund ${reference}`);
    expect(refundOffer.body.uiBlocks?.[0]?.type).toBe("confirm_refund");
    expect(refundOffer.body.uiBlocks?.[0]?.orderId).toBe(order.id);
    const stillPaid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(stillPaid?.status).toBe("PAID");

    const statusOffer = await chat(adminToken, `Start pick on ${reference}`);
    expect(statusOffer.body.uiBlocks?.[0]?.type).toBe("confirm_status");
    expect(statusOffer.body.uiBlocks?.[0]?.status).toBe("PROCESSING");
    const confirmed = await request(app)
      .post(`/api/v1/assistant/threads/${statusOffer.threadId}/staff`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "status", orderId: order.id, status: "PROCESSING" });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.content).toMatch(/Processing/i);
    const processed = await prisma.order.findUnique({ where: { id: order.id } });
    expect(processed?.status).toBe("PROCESSING");

    const customerLogin = await request(app).post("/api/v1/auth/login").send({
      email: customerEmail,
      password: "Shopping123",
    });
    const forbidden = await request(app)
      .post(`/api/v1/assistant/threads/${statusOffer.threadId}/staff`)
      .set("Authorization", `Bearer ${customerLogin.body.accessToken}`)
      .send({ action: "status", orderId: order.id, status: "SHIPPING" });
    expect(forbidden.status).toBe(403);
  });
});
