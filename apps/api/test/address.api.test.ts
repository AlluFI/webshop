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

const home = {
  recipientName: "Demo Customer",
  line1: "Mannerheimintie 12",
  city: "Helsinki",
  postal: "00100",
  country: "FI",
  label: "Home",
};

const work = {
  recipientName: "Demo Customer",
  line1: "Keilaranta 1",
  city: "Espoo",
  postal: "02150",
  country: "FI",
  label: "Work",
};

describeLive("address API", () => {
  const email = `addresses-${Date.now()}@volt.test`;
  let token = "";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it("stores several addresses and switches the default", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Shopping123",
      displayName: "Address Book",
      captchaToken: "test-captcha-token",
    });
    await request(app).post("/api/v1/auth/verify-email").send({
      token: register.body.verifyToken,
    });
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    token = login.body.accessToken as string;

    const first = await request(app)
      .post("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(home);
    expect(first.status).toBe(201);
    expect(first.body.isDefault).toBe(true);

    const second = await request(app)
      .post("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(work);
    expect(second.status).toBe(201);
    expect(second.body.isDefault).toBe(false);

    const listed = await request(app)
      .get("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(2);
    expect(listed.body.items[0].label).toBe("Home");
    expect(listed.body.items[0].isDefault).toBe(true);

    const promoted = await request(app)
      .post(`/api/v1/addresses/${second.body.id}/default`)
      .set("Authorization", `Bearer ${token}`);
    expect(promoted.status).toBe(200);
    expect(promoted.body.isDefault).toBe(true);

    const afterDefault = await request(app)
      .get("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`);
    const workRow = afterDefault.body.items.find((item: { label: string }) => item.label === "Work");
    const homeRow = afterDefault.body.items.find((item: { label: string }) => item.label === "Home");
    expect(workRow.isDefault).toBe(true);
    expect(homeRow.isDefault).toBe(false);
    expect(afterDefault.body.items[0].id).toBe(second.body.id);

    const removed = await request(app)
      .delete(`/api/v1/addresses/${second.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(removed.status).toBe(200);

    const remaining = await request(app)
      .get("/api/v1/addresses")
      .set("Authorization", `Bearer ${token}`);
    expect(remaining.body.items).toHaveLength(1);
    expect(remaining.body.items[0].label).toBe("Home");
    expect(remaining.body.items[0].isDefault).toBe(true);
  });

  it("drops addresses that cannot be decrypted instead of failing the book", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Shopping123",
    });
    token = login.body.accessToken as string;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("missing address-book user");
    await prisma.address.create({
      data: {
        userId: user.id,
        label: "Broken",
        isDefault: false,
        recipientNameEnc: "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCC",
        line1Enc: "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCC",
        cityEnc: "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCC",
        postalEnc: "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCC",
        country: "FI",
      },
    });
    const listed = await request(app).get("/api/v1/addresses").set("Authorization", `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect((listed.body.items as { label: string }[]).some((item) => item.label === "Broken")).toBe(false);
    expect((listed.body.items as { label: string }[]).some((item) => item.label === "Home")).toBe(true);
    expect(await prisma.address.findFirst({ where: { userId: user.id, label: "Broken" } })).toBeTruthy();
  });
});
