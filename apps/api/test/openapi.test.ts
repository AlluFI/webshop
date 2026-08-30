import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";

const app = createApp();

describe("OpenAPI / Swagger", () => {
  it("serves the OpenAPI 3 document for documented routes", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe("Volt & Co API");
    expect(res.body.paths["/api/v1/auth/login"]).toBeTruthy();
    expect(res.body.paths["/api/v1/products"]).toBeTruthy();
    expect(Object.keys(res.body.paths)).toEqual(Object.keys(openApiDocument.paths ?? {}));
  });

  it("serves Swagger UI", async () => {
    const res = await request(app).get("/api/v1/docs/");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("swagger");
  });
});
