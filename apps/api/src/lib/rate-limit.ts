import { redis } from "../redis.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../middleware/error-handler.js";

const BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * refill_per_ms)
local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 120000)
return {allowed, tokens}
`;

export type BucketOptions = {
  key: string;
  capacity: number;
  refillPerSec: number;
  cost?: number;
};

export async function takeToken(options: BucketOptions) {
  const cost = options.cost ?? 1;
  const result = (await redis.eval(
    BUCKET_SCRIPT,
    1,
    options.key,
    options.capacity,
    options.refillPerSec / 1000,
    Date.now(),
    cost,
  )) as [number, number] | null;
  const allowed = Array.isArray(result) ? Number(result[0]) === 1 : true;
  const remaining = Array.isArray(result) ? Number(result[1]) : options.capacity;
  return { allowed, remaining };
}

export function clientKey(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first || req.ip || req.socket.remoteAddress || "unknown").trim();
}

export function rateLimit(scope: string, capacity: number, refillPerSec: number) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (config.nodeEnv === "test" && scope !== "test") {
      next();
      return;
    }
    const { allowed, remaining } = await takeToken({
      key: `rl:${scope}:${clientKey(req)}`,
      capacity,
      refillPerSec,
    });
    res.setHeader("X-RateLimit-Limit", String(capacity));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, Math.floor(remaining))));
    if (!allowed) {
      throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
    }
    next();
  });
}

export const authRateLimit = rateLimit("auth", 60, 1);
export const contactRateLimit = rateLimit("contact", 8, 8 / 60);
export const searchRateLimit = rateLimit("search", 120, 4);
export const apiRateLimit = rateLimit("api", 480, 8);
