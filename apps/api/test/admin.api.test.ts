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
  const warehouseEmail = `warehouse-${stamp}@volt.test`;
  const employeeEmail = `hire-${stamp}@volt.test`;
  const productName = `Volt Test Dongle ${stamp}`;
  let accessToken = "";
  let productId = "";

  afterAll(async () => {
    if (productId) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    await prisma.product.deleteMany({ where: { name: { startsWith: "Volt Test Dongle" } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: [email, customerEmail, warehouseEmail, employeeEmail] } } }).catch(() => undefined);
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

    const shopProduct = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });
    if (shopProduct) {
      const staffCart = await request(app)
        .post("/api/v1/cart/items")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ productId: shopProduct.id, quantity: 1 });
      expect(staffCart.status).toBe(403);
    }

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
    expect(created.body.locator.code).toBe("01|01|1|1");

    const patched = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: productName,
        description: "USB-C hub used only in automated tests.",
        price: 31,
        wholesalePrice: 18,
        vatRate: 25.5,
        stockQuantity: 10,
        category: "accessories",
        brand: "volt",
        featured: true,
        weightKg: 0.08,
        lengthCm: 8,
        widthCm: 3,
        heightCm: 1.2,
        locatorStation: 1,
        locatorBlock: 2,
        locatorShelf: 2,
        locatorPlace: 1,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.price).toBe(31);
    expect(patched.body.locator).toEqual({
      station: 1,
      block: 2,
      shelf: 2,
      place: 1,
      code: "01|02|2|1",
    });

    const adminCatalog = await request(app)
      .get("/api/v1/admin/products?pageSize=48")
      .set("Authorization", `Bearer ${accessToken}`);
    const listedProduct = (
      adminCatalog.body.items as {
        id: string;
        barcode?: string | null;
        wholesalePrice?: number | null;
        pricing?: { margin: number | null };
      }[]
    ).find((row) => row.id === productId);
    expect(listedProduct?.barcode).toMatch(/^[A-Z0-9]{8,32}$/);
    expect(listedProduct?.wholesalePrice).toBe(18);
    expect(listedProduct?.pricing?.margin).toBeGreaterThan(0);
    const sales = await request(app)
      .get("/api/v1/admin/sales?range=this_year")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(sales.status).toBe(200);
    expect(sales.body.series).toBeInstanceOf(Array);
    expect(sales.body.totals).toEqual(
      expect.objectContaining({
        revenue: expect.any(Number),
        vat: expect.any(Number),
        profit: expect.any(Number),
        orders: expect.any(Number),
      }),
    );
    const received = await request(app)
      .post("/api/v1/admin/products/receive")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ barcode: listedProduct?.barcode, quantity: 2 });
    expect(received.status).toBe(200);
    expect(received.body.stockQuantity).toBe(12);

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
    const bulkProduct = await request(app).get(`/api/v1/products/${bulk.body.slugs[0]}`);
    expect(bulkProduct.status).toBe(200);
    expect(bulkProduct.body.images.length).toBeGreaterThan(0);

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
            locatorCode: "01|02|2|1",
          },
        },
        payment: { create: { status: "SUCCEEDED", amount: 18, currency: "EUR" } },
      },
    });
    const missingTracking = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "WITH_COURIER" });
    expect(missingTracking.status).toBe(400);
    const shipped = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "WITH_COURIER",
        carrier: "posti",
        trackingCode: "JJFI66012700410158170/32109367922",
        estimatedDeliveryFrom: "2026-09-17",
        estimatedDeliveryTo: "2026-09-19",
      });
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe("WITH_COURIER");
    expect(shipped.body.tracking.code).toBe("JJFI66012700410158170/32109367922");
    expect(shipped.body.tracking.url).toBe(
      "https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922",
    );
    expect(shipped.body.estimatedDelivery.from).toBe("2026-09-17");
    await prisma.order.delete({ where: { id: shipOrder.id } });

    const olderPick = await prisma.order.create({
      data: {
        status: "PAID",
        createdAt: new Date("2026-10-01T08:00:00.000Z"),
        subtotal: 20,
        shippingCost: 0,
        tax: 0,
        total: 20,
        shippingMethod: "standard",
        contactEmailEnc: encrypt("pick-old@volt.test"),
        contactNameEnc: encrypt("Old Pick"),
        shippingAddressEnc: encryptJson({
          recipientName: "Old Pick",
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
            quantity: 2,
            unitPrice: 10,
            lineTotal: 20,
            locatorCode: "01|02|2|1",
          },
        },
        payment: { create: { status: "SUCCEEDED", amount: 20, currency: "EUR" } },
      },
    });
    const newerPick = await prisma.order.create({
      data: {
        status: "PAID",
        createdAt: new Date("2026-10-02T08:00:00.000Z"),
        subtotal: 10,
        shippingCost: 0,
        tax: 0,
        total: 10,
        shippingMethod: "standard",
        contactEmailEnc: encrypt("pick-new@volt.test"),
        contactNameEnc: encrypt("New Pick"),
        shippingAddressEnc: encryptJson({
          recipientName: "New Pick",
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
            locatorCode: "01|02|2|1",
          },
        },
        payment: { create: { status: "SUCCEEDED", amount: 10, currency: "EUR" } },
      },
    });
    const queue = await request(app)
      .get("/api/v1/admin/orders/picking")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(queue.status).toBe(200);
    const queueIds = (queue.body.items as { id: string; items: { locatorCode: string; quantity: number }[] }[])
      .filter((row) => row.id === olderPick.id || row.id === newerPick.id)
      .map((row) => row.id);
    expect(queueIds).toEqual([olderPick.id, newerPick.id]);
    const olderRow = (queue.body.items as { id: string; items: { id: string; locatorCode: string; quantity: number }[] }[])
      .find((row) => row.id === olderPick.id);
    expect(olderRow?.items[0]?.locatorCode).toBe("01|02|2|1");
    expect(olderRow?.items[0]?.quantity).toBe(2);

    const tooSoon = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/pick`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [{ id: olderRow?.items[0]?.id, quantity: 2 }] });
    expect(tooSoon.status).toBe(409);

    const started = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/process`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("PROCESSING");

    const incomplete = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/pick`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [] });
    expect(incomplete.status).toBe(400);

    const picked = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/pick`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [{ id: olderRow?.items[0]?.id, quantity: 2 }] });
    expect(picked.status).toBe(200);
    expect(picked.body.status).toBe("SHIPPING");

    const remaining = await request(app)
      .get("/api/v1/admin/orders/picking")
      .set("Authorization", `Bearer ${accessToken}`);
    const remainingIds = (remaining.body.items as { id: string }[]).map((row) => row.id);
    expect(remainingIds).toContain(newerPick.id);
    expect(remainingIds).not.toContain(olderPick.id);

    await prisma.order.deleteMany({ where: { id: { in: [olderPick.id, newerPick.id] } } });

    const supplier = await request(app)
      .post("/api/v1/admin/wholesalers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: `Nordic Test Supply ${stamp}`,
        email: `orders-${stamp}@supplier.test`,
        contactName: "Test Buyer",
      });
    expect(supplier.status).toBe(201);
    const wholesalerId = supplier.body.id as string;

    const assigned = await request(app)
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
        locatorStation: 1,
        locatorBlock: 2,
        locatorShelf: 2,
        locatorPlace: 1,
        wholesalerId,
        wholesaleSku: "VN-TEST-DONGLE",
      });
    expect(assigned.status).toBe(200);

    const adminProducts = await request(app)
      .get("/api/v1/admin/products?pageSize=48")
      .set("Authorization", `Bearer ${accessToken}`);
    const listed = (adminProducts.body.items as { id: string; wholesaler?: { name: string; sku: string | null } }[]).find(
      (row) => row.id === productId,
    );
    expect(listed?.wholesaler?.name).toContain("Nordic Test Supply");
    expect(listed?.wholesaler?.sku).toBe("VN-TEST-DONGLE");

    const emptyRestock = await request(app)
      .post(`/api/v1/admin/wholesalers/${wholesalerId}/orders`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [] });
    expect(emptyRestock.status).toBe(400);

    const restock = await request(app)
      .post(`/api/v1/admin/wholesalers/${wholesalerId}/orders`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [{ productId, quantity: 6 }], note: "Fill the test bin." });
    expect(restock.status).toBe(201);
    expect(restock.body.reference).toMatch(/^VCPO-/);
    expect(restock.body.items[0].quantity).toBe(6);

    await prisma.purchaseOrder.deleteMany({ where: { wholesalerId } });
    await prisma.wholesaler.delete({ where: { id: wholesalerId } }).catch(() => undefined);

    await request(app)
      .delete(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`);
  });

  it("creates a staff employee who can sign in with the issued 2FA secret", async () => {
    const created = await request(app)
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: employeeEmail,
        password: "Shopping123",
        displayName: "New Hire",
        role: "sales",
      });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(employeeEmail);
    expect(created.body.role).toBe("sales");
    expect(created.body.totpSecret).toMatch(/^[A-Z2-7]+$/);
    expect(created.body.backupCodes).toHaveLength(10);
    expect(created.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const duplicate = await request(app)
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: employeeEmail,
        password: "Shopping123",
        displayName: "New Hire",
        role: "sales",
      });
    expect(duplicate.status).toBe(409);

    const asCustomer = await request(app)
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: `customer-hire-${stamp}@volt.test`,
        password: "Shopping123",
        displayName: "Not Staff",
        role: "customer",
      });
    expect(asCustomer.status).toBe(400);

    const staff = await request(app)
      .get("/api/v1/admin/users?role=staff&pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(staff.status).toBe(200);
    expect(staff.body.items.every((row: { role: string }) => ["admin", "support", "sales", "warehouse"].includes(row.role))).toBe(
      true,
    );
    expect(staff.body.items.some((row: { email: string }) => row.email === employeeEmail)).toBe(true);

    const sales = await request(app)
      .get("/api/v1/admin/users?role=sales&pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(sales.status).toBe(200);
    expect(sales.body.items.every((row: { role: string }) => row.role === "sales")).toBe(true);
    expect(sales.body.items.some((row: { email: string }) => row.email === employeeEmail)).toBe(true);

    const customers = await request(app)
      .get("/api/v1/admin/users?role=customer&pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(customers.status).toBe(200);
    expect(customers.body.items.every((row: { role: string }) => row.role === "customer")).toBe(true);
    expect(customers.body.items.some((row: { email: string }) => row.email === employeeEmail)).toBe(false);

    const login = await request(app).post("/api/v1/auth/login").send({
      email: employeeEmail,
      password: "Shopping123",
    });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    const mfa = await request(app).post("/api/v1/auth/mfa/complete").send({
      mfaToken: login.body.mfaToken,
      totpCode: authenticator.generate(created.body.totpSecret),
    });
    expect(mfa.status).toBe(200);
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${mfa.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("sales");
  });

  it("limits warehouse staff to products, orders, and picking", async () => {
    const warehouseRole = await prisma.role.upsert({
      where: { name: "warehouse" },
      update: {},
      create: { name: "warehouse" },
    });
    await prisma.user.create({
      data: {
        email: warehouseEmail,
        displayName: "Test Warehouse",
        passwordHash: await argon2.hash("Shopping123"),
        emailVerifiedAt: new Date(),
        totpEnabled: true,
        roleId: warehouseRole.id,
        totpSecret: { create: { secret: encrypt(DEMO_ADMIN_TOTP_SECRET), confirmedAt: new Date() } },
      },
    });
    const login = await request(app).post("/api/v1/auth/login").send({
      email: warehouseEmail,
      password: "Shopping123",
    });
    const mfa = await request(app).post("/api/v1/auth/mfa/complete").send({
      mfaToken: login.body.mfaToken,
      totpCode: authenticator.generate(DEMO_ADMIN_TOTP_SECRET),
    });
    expect(mfa.status).toBe(200);
    const token = mfa.body.accessToken as string;

    expect((await request(app).get("/api/v1/admin/products").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/orders/picking").set("Authorization", `Bearer ${token}`)).status).toBe(
      200,
    );
    expect((await request(app).get("/api/v1/admin/sales").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/audit").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/admin/users")
          .set("Authorization", `Bearer ${token}`)
          .send({
            email: `blocked-hire-${stamp}@volt.test`,
            password: "Shopping123",
            displayName: "Blocked",
            role: "warehouse",
          })
      ).status,
    ).toBe(403);
    expect((await request(app).post("/api/v1/admin/categories").set("Authorization", `Bearer ${token}`).send({
      name: "Warehouse blocked",
    })).status).toBe(403);
  });
});
