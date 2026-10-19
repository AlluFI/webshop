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
    const leftover = await prisma.product.findMany({
      where: {
        OR: [
          ...(productId ? [{ id: productId }] : []),
          { name: { startsWith: "Volt Test Dongle" } },
          { name: { startsWith: "Volt Bulk Cable" } },
        ],
      },
      select: { id: true },
    });
    const leftoverIds = leftover.map((row) => row.id);
    if (leftoverIds.length) {
      await prisma.cartItem.deleteMany({ where: { productId: { in: leftoverIds } } }).catch(() => undefined);
      await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: leftoverIds } } }).catch(() => undefined);
      const orderRows = await prisma.orderItem.findMany({
        where: { productId: { in: leftoverIds } },
        select: { orderId: true },
      });
      const orderIds = [...new Set(orderRows.map((row) => row.orderId))];
      if (orderIds.length) {
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => undefined);
      }
      await prisma.inventoryReservation.deleteMany({ where: { productId: { in: leftoverIds } } }).catch(() => undefined);
      await prisma.product.deleteMany({ where: { id: { in: leftoverIds } } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: { in: [email, customerEmail, warehouseEmail, employeeEmail] } } }).catch(() => undefined);
  });

  it("requires 2FA for staff login and supports product CRUD plus bulk JSON", { timeout: 15_000 }, async () => {
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
        modelCode: "VOLT-HUB-1",
        colorName: "Black",
        warrantyMonths: 24,
        warrantyNote: "Manufacturer warranty",
        manufacturerUrl: "https://www.example.com/products/usb-c-hub",
        brandUrl: "https://www.example.com",
        highlights: "Four USB-C ports\n60W pass-through",
        packageContents: "Hub\nUSB-C cable",
        attributes: [{ name: "Ports", value: "4× USB-C" }],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.price).toBe(31);
    expect(patched.body.warrantyMonths).toBe(24);
    expect(patched.body.manufacturerUrl).toBe("https://www.example.com/products/usb-c-hub");
    expect(patched.body.modelCode).toBe("VOLT-HUB-1");
    expect(patched.body.attributes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Ports", value: "4× USB-C" })]),
    );
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
    const overview = await request(app)
      .get("/api/v1/admin/reports/overview?range=this_year")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.series).toBeInstanceOf(Array);
    expect(overview.body.totals).toEqual(
      expect.objectContaining({
        customerAmount: expect.any(Number),
        productSales: expect.any(Number),
        shipping: expect.any(Number),
        vat: expect.any(Number),
        netOfVat: expect.any(Number),
        refunds: expect.any(Number),
        netSales: expect.any(Number),
        margin: expect.any(Number),
        orders: expect.any(Number),
        units: expect.any(Number),
        customers: expect.any(Number),
        aov: expect.any(Number),
      }),
    );
    const customers = await request(app)
      .get("/api/v1/admin/reports/customers?range=this_year")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(customers.status).toBe(200);
    expect(customers.body.items).toBeInstanceOf(Array);
    expect(customers.body.totals).toEqual(
      expect.objectContaining({
        customers: expect.any(Number),
        newCustomers: expect.any(Number),
        returningCustomers: expect.any(Number),
        customerAmount: expect.any(Number),
        orders: expect.any(Number),
        aov: expect.any(Number),
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
    expect(blockedRole.body.error).toMatch(/customer accounts cannot change role/i);
    const directory = await request(app)
      .get("/api/v1/admin/customers?pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(directory.status).toBe(200);
    expect(directory.body.items.some((row: { email: string | null }) => row.email === customerEmail)).toBe(true);
    const detail = await request(app)
      .get(`/api/v1/admin/customers/${customer.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("active");
    expect(detail.body.marketingOptIn).toBe(false);
    expect(Array.isArray(detail.body.orders)).toBe(true);

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
    const claimsMissing = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "CLAIMS" });
    expect(claimsMissing.status).toBe(400);
    const claims = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "CLAIMS", note: "Customer reported damage" });
    expect(claims.status).toBe(200);
    expect(claims.body.status).toBe("CLAIMS");
    expect(claims.body.hasDeviation).toBe(true);
    const pickingAfterClaims = await request(app)
      .get("/api/v1/admin/orders/picking")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(pickingAfterClaims.status).toBe(200);
    expect((pickingAfterClaims.body.items as { id: string }[]).some((row) => row.id === shipOrder.id)).toBe(false);
    const unmarked = await request(app)
      .post(`/api/v1/admin/orders/${shipOrder.id}/deviation`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ hasDeviation: false });
    expect(unmarked.status).toBe(200);
    expect(unmarked.body.hasDeviation).toBe(false);
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
    const expressPick = await prisma.order.create({
      data: {
        status: "PAID",
        createdAt: new Date("2026-10-03T08:00:00.000Z"),
        subtotal: 10,
        shippingCost: 18,
        tax: 0,
        total: 28,
        shippingMethod: "express",
        contactEmailEnc: encrypt("pick-express@volt.test"),
        contactNameEnc: encrypt("Express Pick"),
        shippingAddressEnc: encryptJson({
          recipientName: "Express Pick",
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
        payment: { create: { status: "SUCCEEDED", amount: 28, currency: "EUR" } },
      },
    });
    const queue = await request(app)
      .get("/api/v1/admin/orders/picking")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.postiMode).toBe("mock");
    const queueIds = (queue.body.items as { id: string; items: { locatorCode: string; quantity: number }[] }[])
      .filter((row) => row.id === olderPick.id || row.id === newerPick.id || row.id === expressPick.id)
      .map((row) => row.id);
    expect(queueIds).toEqual([expressPick.id, olderPick.id, newerPick.id]);
    const olderRow = (
      queue.body.items as {
        id: string;
        packaging?: { note?: string };
        items: { id: string; locatorCode: string; quantity: number }[];
      }[]
    ).find((row) => row.id === olderPick.id);
    expect(olderRow?.items[0]?.locatorCode).toBe("01|02|2|1");
    expect(olderRow?.items[0]?.quantity).toBe(2);
    expect(olderRow?.packaging?.note).toBeTruthy();

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
    const remainingIds = (remaining.body.items as { id: string; status: string }[]).map((row) => row.id);
    expect(remainingIds).toContain(newerPick.id);
    expect(remainingIds).toContain(olderPick.id);
    expect((remaining.body.items as { id: string; status: string }[]).find((row) => row.id === olderPick.id)?.status).toBe(
      "SHIPPING",
    );

    const tooEarlyLabel = await request(app)
      .post(`/api/v1/admin/orders/${newerPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "posti" });
    expect(tooEarlyLabel.status).toBe(409);

    const shipment = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "posti" });
    expect(shipment.status).toBe(200);
    expect(shipment.body.source).toBe("mock");
    expect(shipment.body.productCode).toBe("2104");
    expect(shipment.body.trackingCode).toMatch(/^JJFI/);
    expect(shipment.body.label.body).toContain("Old Pick");
    expect(shipment.body.label.body).toContain(shipment.body.trackingCode);

    const reprint = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "posti" });
    expect(reprint.status).toBe(200);
    expect(reprint.body.trackingCode).toBe(shipment.body.trackingCode);

    const manualTracking = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "posti", trackingCode: "JJFI66012700410158170" });
    expect(manualTracking.status).toBe(200);
    expect(manualTracking.body.trackingCode).toBe("JJFI66012700410158170");
    expect(manualTracking.body.label.body).toContain("JJFI66012700410158170");

    const postnord = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "postnord" });
    expect(postnord.status).toBe(200);
    expect(postnord.body.source).toBe("mock");
    expect(postnord.body.productCode).toBe("17");
    expect(postnord.body.trackingCode).toMatch(/^00TEST/);

    const budbee = await request(app)
      .post(`/api/v1/admin/orders/${olderPick.id}/shipment`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ carrier: "budbee" });
    expect(budbee.status).toBe(200);
    expect(budbee.body.productCode).toBe("HOME");
    expect(budbee.body.trackingCode).toMatch(/^BUD-DEV-/);

    await prisma.order.deleteMany({ where: { id: { in: [olderPick.id, newerPick.id, expressPick.id] } } });

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

    const promoted = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: productName,
        description: "USB-C hub used only in automated tests.",
        price: 31,
        promoPrice: 24.5,
        promoStartsAt: "2026-10-01T00:00",
        promoEndsAt: "2026-12-31T23:59",
        stockQuantity: 10,
        category: "accessories",
        brand: "volt",
        weightKg: 0.08,
        lengthCm: 8,
        widthCm: 3,
        heightCm: 1.2,
      });
    expect(promoted.status).toBe(200);
    expect(promoted.body.onPromotion).toBe(true);
    expect(promoted.body.sellingPrice).toBe(24.5);
    expect(promoted.body.lowestPrice30d).toBeGreaterThan(0);

    const history = await request(app)
      .get(`/api/v1/admin/products/${productId}/promotions`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body.items[0]).toMatchObject({ promoPrice: 24.5, regularPrice: 31 });

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

    const customersOnUsers = await request(app)
      .get("/api/v1/admin/users?role=customer&pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(customersOnUsers.status).toBe(400);
    const staffOnly = await request(app)
      .get("/api/v1/admin/users?pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(staffOnly.status).toBe(200);
    expect(staffOnly.body.items.every((row: { role: string }) => ["admin", "support", "sales", "warehouse"].includes(row.role))).toBe(
      true,
    );

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

    const selfRename = await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${mfa.body.accessToken}`)
      .send({ displayName: "I renamed myself" });
    expect(selfRename.status).toBe(403);

    const staffAddress = await request(app)
      .post("/api/v1/addresses")
      .set("Authorization", `Bearer ${mfa.body.accessToken}`)
      .send({
        recipientName: "New Hire",
        line1: "Mannerheimintie 12",
        city: "Helsinki",
        postal: "00100",
        country: "FI",
      });
    expect(staffAddress.status).toBe(403);

    const renamed = await request(app)
      .patch(`/api/v1/admin/users/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ displayName: "Renamed Hire" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.displayName).toBe("Renamed Hire");
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
    const boxes = await request(app).get("/api/v1/admin/packages").set("Authorization", `Bearer ${token}`);
    expect(boxes.status).toBe(200);
    let boxId = (boxes.body.items as { id: string }[])[0]?.id;
    if (!boxId) {
      const createdBox = await prisma.packageSize.create({
        data: {
          code: `S-${stamp}`,
          name: "Posti S",
          lengthCm: 25,
          widthCm: 17.5,
          heightCm: 8,
          maxWeightKg: 2,
          stockQuantity: 4,
          sortOrder: 1,
        },
      });
      boxId = createdBox.id;
    }
    const ordered = await request(app)
      .post(`/api/v1/admin/packages/${boxId}/order`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 6 });
    expect(ordered.status).toBe(201);
    expect(ordered.body.incomingQuantity).toBeGreaterThanOrEqual(6);
    const received = await request(app)
      .post(`/api/v1/admin/packages/${boxId}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 6 });
    expect(received.status).toBe(200);
    expect((await request(app).get("/api/v1/admin/shipping").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/orders/picking").set("Authorization", `Bearer ${token}`)).status).toBe(
      200,
    );
    expect((await request(app).get("/api/v1/admin/sales").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect(
      (await request(app).get("/api/v1/admin/reports/overview").set("Authorization", `Bearer ${token}`)).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/admin/reports/customers").set("Authorization", `Bearer ${token}`)).status,
    ).toBe(403);
    expect((await request(app).get("/api/v1/admin/audit").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/integrations/keys").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/users/00000000-0000-0000-0000-000000000000")
          .set("Authorization", `Bearer ${token}`)
          .send({ displayName: "Nope" })
      ).status,
    ).toBe(403);
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
