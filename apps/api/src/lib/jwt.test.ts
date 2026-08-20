import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  remainingTtlSec,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";

const secret = "unit-test-access-secret-32chars-min";
const refreshSecret = "unit-test-refresh-secret-32chars";

describe("JWT token handling", () => {
  it("generates a verifiable access token with header, payload, and signature parts", () => {
    const token = signAccessToken(
      { sub: "user-1", email: "a@volt.test", role: "customer", jti: "jti-1" },
      secret,
      900,
    );
    expect(token.split(".")).toHaveLength(3);
    const payload = verifyAccessToken(token, secret);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@volt.test");
    expect(payload.typ).toBe("access");
    expect(payload.jti).toBe("jti-1");
  });

  it("rejects an expired access token", () => {
    const token = jwt.sign(
      { sub: "user-1", email: "a@volt.test", role: "customer", jti: "jti-2", typ: "access" },
      secret,
      { expiresIn: -10 },
    );
    expect(() => verifyAccessToken(token, secret)).toThrow();
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = signAccessToken(
      { sub: "user-1", email: "a@volt.test", role: "customer", jti: "jti-3" },
      secret,
      900,
    );
    expect(() => verifyAccessToken(token, "different-secret-that-is-long-enough")).toThrow();
  });

  it("rejects a refresh token used as an access token", () => {
    const token = signRefreshToken(
      { sub: "user-1", fam: "fam-1", jti: "jti-4" },
      refreshSecret,
      3600,
    );
    expect(() => verifyAccessToken(token, refreshSecret)).toThrow();
    const refresh = verifyRefreshToken(token, refreshSecret);
    expect(refresh.typ).toBe("refresh");
    expect(refresh.fam).toBe("fam-1");
  });

  it("computes remaining TTL from exp", () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    expect(remainingTtlSec({ exp })).toBeGreaterThan(0);
    expect(remainingTtlSec({ exp })).toBeLessThanOrEqual(30);
  });

  it("decodes standard JWT structure", () => {
    const token = signAccessToken(
      { sub: "user-1", email: "a@volt.test", role: "customer", jti: "jti-5" },
      secret,
      900,
    );
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded).toBeTruthy();
    expect(decoded && typeof decoded !== "string" && decoded.header.alg).toBe("HS256");
    expect(decoded && typeof decoded !== "string" && decoded.payload).toMatchObject({
      sub: "user-1",
      typ: "access",
    });
  });
});
