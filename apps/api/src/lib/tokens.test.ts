import { describe, expect, it } from "vitest";
import { TokenService, type RefreshStore } from "./tokens.js";

class MemoryRedis {
  data = new Map<string, string>();
  sets = new Map<string, Set<string>>();

  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
    return "OK";
  }
  async del(...keys: string[]) {
    for (const key of keys) {
      this.data.delete(key);
      this.sets.delete(key);
    }
    return keys.length;
  }
  async sadd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
    return 1;
  }
  async srem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
    return 1;
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire() {
    return 1;
  }
}

const access = "unit-test-access-secret-32chars-min";
const refresh = "unit-test-refresh-secret-32chars";

describe("refresh token rotation", () => {
  it("issues a new refresh token and rejects the previous one", async () => {
    const redis = new MemoryRedis();
    const service = new TokenService(
      redis as unknown as RefreshStore,
      access,
      refresh,
      900,
      3600,
    );
    const first = await service.createSession("u1", "a@volt.test", "customer");
    const rotated = await service.rotate(first.refreshToken, "a@volt.test", "customer");
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    const stored = [...redis.data.values()].find((value) => value.startsWith("v1:"));
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(first.refreshToken);
    await expect(
      service.rotate(first.refreshToken, "a@volt.test", "customer"),
    ).rejects.toMatchObject({ status: 401, message: "Refresh token reuse detected" });
  });

  it("revokes a refresh family so the token cannot be used again", async () => {
    const service = new TokenService(
      new MemoryRedis() as unknown as RefreshStore,
      access,
      refresh,
      900,
      3600,
    );
    const first = await service.createSession("u1", "a@volt.test", "customer");
    await service.revokeRefresh(first.refreshToken);
    await expect(
      service.rotate(first.refreshToken, "a@volt.test", "customer"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("denies a revoked access token", async () => {
    const service = new TokenService(
      new MemoryRedis() as unknown as RefreshStore,
      access,
      refresh,
      900,
      3600,
    );
    const first = await service.createSession("u1", "a@volt.test", "customer");
    await service.assertAccessUsable(first.accessToken);
    await service.denyAccessToken(first.accessToken);
    await expect(service.assertAccessUsable(first.accessToken)).rejects.toMatchObject({
      status: 401,
      message: "Access token revoked",
    });
  });
});
