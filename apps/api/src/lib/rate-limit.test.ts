import { describe, expect, it } from "vitest";
import { takeToken } from "./rate-limit.js";
import { redis } from "../redis.js";

describe("token-bucket rate limit", () => {
  it("allows up to capacity then denies", async () => {
    try {
      await redis.ping();
    } catch {
      return;
    }
    const key = `rl:test-unit:${Date.now()}`;
    const first = await takeToken({ key, capacity: 2, refillPerSec: 0.0001 });
    const second = await takeToken({ key, capacity: 2, refillPerSec: 0.0001 });
    const third = await takeToken({ key, capacity: 2, refillPerSec: 0.0001 });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});
