import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { DEMO_ADMIN_TOTP_SECRET } from "@volt/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { redis } from "../src/redis.js";
import { encrypt, encryptJson } from "../src/lib/crypto.js";

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

describeLive("admin API", () => {
  const stamp = Date.now();
  const email = `admin-${stamp}@volt.test`;
  const customerEmail = `promote-${stamp}@volt.test`;
  const productName = `Volt Test Dongle ${stamp}`;
  let accessToken = "";
  let productId = "";

  afterAll(async () => {
    if (productId) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    await prisma.product.deleteMany({ where: { name: { startsWith: "Volt Test Dongle" } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: [email, customerEmail] } } }).catch(() => undefined);
  });

  it("requires 2FA for staff login and supports product CRUD plus bulk JSON", async () => {
    const adminRole = await prisma.role.upsert({
      where: { name: "admin" },
      update: {},
      create: { name: "admin" },
    });
    await prisma.role.upsert({
      where: { name: "customer" },
      update: {},
      create: { name: "customer" },
    });
    await prisma.user.create({
      data: {
        email,
        displayName: "Test Admin",
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        totpEnabled: true,
        roleId: adminRole.id,
        totpSecret: { create: { secret: encrypt(DEMO_ADMIN_TOTP_SECRET), confirmedAt: new Date() } },
      },
    });

    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);

    const mfa = await request(app).post("/api/v1/auth/mfa/complete").send({
      mfaToken: login.body.mfaToken,
      totpCode: authenticator.generate(DEMO_ADMIN_TOTP_SECRET),
    });
    expect(mfa.status).toBe(200);
    accessToken = mfa.body.accessToken;

    const forbidden = await request(app).get("/api/v1/admin/products");
    expect(forbidden.status).toBe(401);

    const created = await request(app)
      .post("/api/v1/admin/products")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: productName,
        description: "USB-C hub used only in automated tests.",
        price: 29.5,
        stockQuantity: 12,
        category: "accessories",
        brand: "volt",
        weightKg: 0.08,
        lengthCm: 8,
        widthCm: 3,
        heightCm: 1.2,
      });
    expect(created.status).toBe(201);
    productId = created.body.id;
    expect(created.body.weightLb).toBeGreaterThan(0);
    expect(created.body.dimensions.imperial.lengthIn).toBeGreaterThan(0);

    const patched = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: productName,
        description: "USB-C hub used only in automated tests.",
        price: 31,
        stockQuantity: 10,
        category: "accessories",
        brand: "volt",
        featured: true,
        weightKg: 0.08,
        lengthCm: 8,
        widthCm: 3,
        heightCm: 1.2,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.price).toBe(31);

    const audit = await request(app)
      .get("/api/v1/admin/audit?entity=product")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(audit.status).toBe(200);
    const priceChange = (audit.body.items as { changes: { field: string; from: string; to: string }[] }[]).find(
      (row) => row.changes.some((change) => change.field === "price"),
    );
    expect(priceChange?.changes).toEqual(
      expect.arrayContaining([{ field: "price", from: "29.5", to: "31" }]),
    );

    const bulk = await request(app)
      .post("/api/v1/admin/products/bulk")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        items: [
          {
            name: `Volt Bulk Cable ${Date.now()}`,
            description: "USB-C cable from bulk JSON upload.",
            price: 12,
            stockQuantity: 40,
            category: "accessories",
            brand: "volt",
            weightKg: 0.05,
            lengthCm: 100,
            widthCm: 1,
            heightCm: 1,
          },
        ],
      });
    expect(bulk.status).toBe(200);
    expect(bulk.body.created).toBe(1);
    const created = await request(app).get(`/api/v1/products/${bulk.body.slugs[0]}`);
    expect(created.status).toBe(200);
    expect(created.body.images.length).toBeGreaterThan(0);

    const category = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: `Test Cables ${Date.now()}`, description: "Temporary category for tests" });
    expect(category.status).toBe(201);
    const renamed = await request(app)
      .patch(`/api/v1/admin/categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: category.body.name, description: "Updated" });
    expect(renamed.status).toBe(200);
    const removedCategory = await request(app)
      .delete(`/api/v1/admin/categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(removedCategory.status).toBe(200);

    const register = await request(app).post("/api/v1/auth/register").send({
      email: customerEmail,
      password: "Shopping123",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({ token: register.body.verifyToken });
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail } });
    const blockedRole = await request(app)
      .post(`/api/v1/admin/users/${customer.id}/role`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "support" });
    expect(blockedRole.status).toBe(409);

    const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const shipOrder = await prisma.order.create({
      data: {
        status: "PAID",
        subtotal: 10,
        shippingCost: 8,
        tax: 0,
        total: 18,
        shippingMethod: "standard",
        contactEmailEnc: encrypt("ship-test@volt.test"),
        contactNameEnc: encrypt("Ship Test"),
        shippingAddressEnc: encryptJson({
          recipientName: "Ship Test",
          line1: "Testikatu 1",
          city: "Helsinki",
          postal: "00100",
          country: "FI",
          countryName: "Finland",
        }),
        items: {
          create: {
            productId: catalogProduct.id,
            productName: catalogProduct.name,
            quantity: 1,
            unitPrice: 10,
            lineTotal: 10,
          },
        },
        payment: { create: { status: "SUCCEEDED", amount: 18, currency: "EUR" } },
      },
    });
    const missingTracking = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "SHIPPED" });
    expect(missingTracking.status).toBe(400);
    const shipped = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "SHIPPED",
        carrier: "posti",
        trackingCode: "JJFI66012700410158170/32109367922",
        estimatedDeliveryFrom: "2026-09-17",
        estimatedDeliveryTo: "2026-09-19",
      });
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe("SHIPPED");
    expect(shipped.body.tracking.code).toBe("JJFI66012700410158170/32109367922");
    expect(shipped.body.tracking.url).toBe(
      "https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922",
    );
    expect(shipped.body.estimatedDelivery.from).toBe("2026-09-17");
    await prisma.order.delete({ where: { id: shipOrder.id } });

    await request(app)
      .delete(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`);
  });
});
