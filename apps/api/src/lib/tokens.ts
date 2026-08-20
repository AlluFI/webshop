import { randomUUID } from "node:crypto";
import { HttpError } from "../http-error.js";
import {
  remainingTtlSec,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";

export type RefreshStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export class TokenService {
  constructor(
    private readonly redis: RefreshStore,
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
    private readonly accessTtlSec: number,
    private readonly refreshTtlSec: number,
  ) {}

  async createSession(userId: string, email: string, role: string) {
    const familyId = randomUUID();
    const refreshJti = randomUUID();
    const refreshToken = signRefreshToken(
      { sub: userId, fam: familyId, jti: refreshJti },
      this.refreshSecret,
      this.refreshTtlSec,
    );
    await this.redis.set(`rf:${familyId}`, refreshJti, "EX", this.refreshTtlSec);
    await this.redis.sadd(`uf:${userId}`, familyId);
    await this.redis.expire(`uf:${userId}`, Math.max(this.refreshTtlSec, 86400 * 30));
    const accessToken = signAccessToken(
      { sub: userId, email, role, jti: randomUUID() },
      this.accessSecret,
      this.accessTtlSec,
    );
    return { accessToken, refreshToken, familyId };
  }

  async rotate(refreshToken: string, email: string, role: string) {
    let parsed;
    try {
      parsed = verifyRefreshToken(refreshToken, this.refreshSecret);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }
    const current = await this.redis.get(`rf:${parsed.fam}`);
    if (current === null) {
      throw new HttpError(401, "Session expired or revoked");
    }
    if (current !== parsed.jti) {
      await this.revokeFamily(parsed.fam, parsed.sub);
      throw new HttpError(401, "Refresh token reuse detected");
    }
    const newJti = randomUUID();
    const newRefresh = signRefreshToken(
      { sub: parsed.sub, fam: parsed.fam, jti: newJti },
      this.refreshSecret,
      this.refreshTtlSec,
    );
    await this.redis.set(`rf:${parsed.fam}`, newJti, "EX", this.refreshTtlSec);
    const accessToken = signAccessToken(
      { sub: parsed.sub, email, role, jti: randomUUID() },
      this.accessSecret,
      this.accessTtlSec,
    );
    return { userId: parsed.sub, accessToken, refreshToken: newRefresh };
  }

  async revokeRefresh(refreshToken: string) {
    try {
      const parsed = verifyRefreshToken(refreshToken, this.refreshSecret);
      await this.revokeFamily(parsed.fam, parsed.sub);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }
  }

  async revokeAll(userId: string) {
    const families = await this.redis.smembers(`uf:${userId}`);
    for (const fam of families) {
      await this.redis.del(`rf:${fam}`);
    }
    await this.redis.del(`uf:${userId}`);
    await this.redis.set(
      `user:${userId}:valid_after`,
      String(Math.floor(Date.now() / 1000)),
    );
  }

  async denyAccessToken(accessToken: string) {
    try {
      const payload = verifyAccessToken(accessToken, this.accessSecret);
      await this.redis.set(
        `deny:${payload.jti}`,
        "1",
        "EX",
        remainingTtlSec(payload),
      );
    } catch {
      // already invalid
    }
  }

  async assertAccessUsable(token: string) {
    let payload;
    try {
      payload = verifyAccessToken(token, this.accessSecret);
    } catch (error) {
      const message =
        error instanceof Error && error.name === "TokenExpiredError"
          ? "Access token expired"
          : "Invalid access token";
      throw new HttpError(401, message);
    }
    const denied = await this.redis.get(`deny:${payload.jti}`);
    if (denied) {
      throw new HttpError(401, "Access token revoked");
    }
    const validAfter = await this.redis.get(`user:${payload.sub}:valid_after`);
    if (validAfter && (payload.iat ?? 0) < Number(validAfter)) {
      throw new HttpError(401, "Access token revoked");
    }
    return payload;
  }

  private async revokeFamily(familyId: string, userId: string) {
    await this.redis.del(`rf:${familyId}`);
    await this.redis.srem(`uf:${userId}`, familyId);
  }
}
