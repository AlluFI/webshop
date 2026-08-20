import IoRedis from "ioredis";
import { config } from "./config.js";

type RedisClient = {
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<unknown>;
  disconnect(): void;
};

const RedisCtor = IoRedis as unknown as new (
  url: string,
  options?: { maxRetriesPerRequest?: number },
) => RedisClient;

export const redis = new RedisCtor(config.redisUrl, { maxRetriesPerRequest: 3 });
