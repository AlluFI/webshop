import { describe, expect, it } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";

const app = createApp();

async function ready() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

describeLive("security input handling", () => {
  it("rejects SQL injection payloads in search without 500s", async () => {
    const payload = "'; DROP TABLE products; --";
    const res = await request(app).get("/api/v1/products").query({ q: payload });
    expect(res.status).toBeLessThan(500);
    const stillThere = await prisma.product.count();
    expect(stillThere).toBeGreaterThan(0);
  });

  it("rejects malformed JSON and oversized fields on register", async () => {
    const malformed = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send("{\"email\":");
    expect(malformed.status).toBeGreaterThanOrEqual(400);

    const long = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "not-an-email",
        password: "x",
        captchaToken: "a".repeat(5000),
      });
    expect(long.status).toBe(400);
    expect(long.body.error).toBeTruthy();
  });

  it("does not treat a missing token as authenticated", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated admin routes", async () => {
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.status).toBe(401);
  });

  it("returns 429 from the token-bucket probe after capacity is exhausted", async () => {
    const ip = `203.0.113.${Date.now() % 200}`;
    let lastStatus = 0;
    let lastError = "";
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).get("/api/v1/health/limited").set("X-Forwarded-For", ip);
      lastStatus = res.status;
      lastError = String(res.body.error || "");
    }
    expect(lastStatus).toBe(429);
    expect(lastError).toMatch(/too many/i);
  });

  it("stores addresses and TOTP secrets as AES-GCM ciphertext", async () => {
    const email = `enc-${Date.now()}@volt.test`;
    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Encrypt Check",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({ token: register.body.verifyToken });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    const token = login.body.accessToken as string;
    await request(app)
      .post("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        recipientName: "Encrypt Check",
        line1: "Secret Street 9",
        city: "Helsinki",
        postal: "00100",
        country: "FI",
      });
    const row = await prisma.address.findFirst({
      where: { user: { email } },
    });
    expect(row?.line1Enc.startsWith("v1:")).toBe(true);
    expect(row?.line1Enc).not.toContain("Secret Street");
    expect(row?.recipientNameEnc.startsWith("v1:")).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash.startsWith("$argon2")).toBe(true);

    const setup = await request(app).post("/api/v1/auth/totp/setup").set("Authorization", `Bearer ${token}`);
    expect(setup.status).toBe(200);
    const confirm = await request(app)
      .post("/api/v1/auth/totp/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: authenticator.generate(setup.body.secret) });
    expect(confirm.status).toBe(200);
    const totp = await prisma.totpSecret.findUniqueOrThrow({ where: { userId: user.id } });
    expect(totp.secret.startsWith("v1:")).toBe(true);
    expect(totp.secret).not.toBe(setup.body.secret);

    await prisma.user.deleteMany({ where: { email } });
  });
});
