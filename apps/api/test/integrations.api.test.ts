import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { DEMO_ADMIN_TOTP_SECRET } from "@volt/shared";
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

describeLive("integration API", () => {
  const stamp = Date.now();
  const email = `integrations-admin-${stamp}@volt.test`;
  const keyName = `BI test ${stamp}`;
  const piiName = `BI pii ${stamp}`;
  const hookName = `Hook ${stamp}`;
  let accessToken = "";
  const createdKeyIds: string[] = [];
  const createdHookIds: string[] = [];

  afterAll(async () => {
    if (createdHookIds.length) {
      await prisma.integrationEndpoint.deleteMany({ where: { id: { in: createdHookIds } } }).catch(() => undefined);
    }
    if (createdKeyIds.length) {
      await prisma.integrationApiKey.deleteMany({ where: { id: { in: createdKeyIds } } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("issues machine keys, hides PII by default, and rejects missing keys", { timeout: 15_000 }, async () => {
    const adminRole = await prisma.role.upsert({
      where: { name: "admin" },
      update: {},
      create: { name: "admin" },
    });
    await prisma.user.create({
      data: {
        email,
        displayName: "Integrations Admin",
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
    const mfa = await request(app).post("/api/v1/auth/mfa/complete").send({
      mfaToken: login.body.mfaToken,
      totpCode: authenticator.generate(DEMO_ADMIN_TOTP_SECRET),
    });
    expect(mfa.status).toBe(200);
    accessToken = mfa.body.accessToken;

    const created = await request(app)
      .post("/api/v1/admin/integrations/keys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: keyName, scopes: ["orders", "catalog", "customers"] });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^volt_test_/);
    createdKeyIds.push(created.body.id);
    const machineKey = created.body.token as string;

    expect((await request(app).get("/api/v1/integrations/v1/orders")).status).toBe(401);

    const orders = await request(app).get("/api/v1/integrations/v1/orders").set("X-Api-Key", machineKey);
    expect(orders.status).toBe(200);
    expect(Array.isArray(orders.body.items)).toBe(true);
    if (orders.body.items[0]) {
      expect(orders.body.items[0]).not.toHaveProperty("contactEmailEnc");
    }

    const bearer = await request(app)
      .get("/api/v1/integrations/v1/products")
      .set("Authorization", `Bearer ${machineKey}`);
    expect(bearer.status).toBe(200);

    const customers = await request(app).get("/api/v1/integrations/v1/customers").set("X-Api-Key", machineKey);
    expect(customers.status).toBe(200);
    expect(customers.body.items.every((row: { email?: string }) => row.email === undefined)).toBe(true);

    const pii = await request(app)
      .post("/api/v1/admin/integrations/keys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: piiName, scopes: ["customers", "pii"] });
    expect(pii.status).toBe(201);
    createdKeyIds.push(pii.body.id);

    const withPii = await request(app).get("/api/v1/integrations/v1/customers").set("X-Api-Key", pii.body.token);
    expect(withPii.status).toBe(200);
    if (withPii.body.items.length) {
      expect(withPii.body.items[0]).toHaveProperty("email");
    }

    const catalogDenied = await request(app).get("/api/v1/integrations/v1/products").set("X-Api-Key", pii.body.token);
    expect(catalogDenied.status).toBe(403);

    const hook = await request(app)
      .post("/api/v1/admin/integrations/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: hookName,
        url: "http://localhost:9/volt-test",
        events: ["order.paid", "order.updated"],
      });
    expect(hook.status).toBe(201);
    expect(hook.body.secret).toMatch(/^whsec_/);
    createdHookIds.push(hook.body.id);

    const listed = await request(app)
      .get("/api/v1/admin/integrations/webhooks")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === hook.body.id)).toBe(true);

    const revoked = await request(app)
      .post(`/api/v1/admin/integrations/keys/${created.body.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(revoked.status).toBe(200);
    expect((await request(app).get("/api/v1/integrations/v1/orders").set("X-Api-Key", machineKey)).status).toBe(401);

    const removed = await request(app)
      .delete(`/api/v1/admin/integrations/webhooks/${hook.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
  });
});
