import { describe, expect, it } from "vitest";
import request from "supertest";
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
});
