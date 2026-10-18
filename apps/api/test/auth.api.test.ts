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
    return true;
  } catch {
    return false;
  }
}

const live = await ready();
const describeLive = live ? describe : describe.skip;

describeLive("auth API", () => {
  const email = `user-${Date.now()}@volt.test`;
  let refreshToken = "";
  let accessToken = "";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("registers with CAPTCHA, verifies email, and logs in", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Tester",
      captchaToken: "test-captcha-token",
    });
    expect(register.status).toBe(201);
    expect(register.body.verifyToken).toBeTruthy();

    const duplicate = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      captchaToken: "test-captcha-token",
    });
    expect(duplicate.status).toBe(409);

    const unverified = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    expect(unverified.status).toBe(401);

    const verify = await request(app).post("/api/v1/auth/verify-email").send({
      token: register.body.verifyToken,
    });
    expect(verify.status).toBe(200);

    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    accessToken = login.body.accessToken;
    refreshToken = login.body.refreshToken;

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    const renamed = await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ displayName: "Updated Tester" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.displayName).toBe("Updated Tester");
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const first = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(reuse.status).toBe(401);

    refreshToken = first.body.refreshToken;
    accessToken = first.body.accessToken;
  });

  it("revokes access and refresh on logout", async () => {
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(401);

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it("issues a reset token for Google-only accounts that have no password", async () => {
    const oauthEmail = `oauth-${Date.now()}@volt.test`;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "customer" } });
    await prisma.user.create({
      data: { email: oauthEmail, emailVerifiedAt: new Date(), roleId: role.id },
    });
    try {
      const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: oauthEmail });
      expect(res.status).toBe(200);
      const tokens = await prisma.passwordResetToken.count({
        where: { user: { email: oauthEmail }, usedAt: null },
      });
      expect(tokens).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { email: oauthEmail } });
    }
  });
});
