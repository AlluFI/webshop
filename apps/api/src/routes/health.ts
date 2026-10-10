import { Router } from "express";
import { prisma } from "../prisma.js";
import { redis } from "../redis.js";
import { rabbitReachable, queueInline } from "../lib/queue.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { rateLimit } from "../lib/rate-limit.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let postgres = false;
    let redisOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      postgres = true;
    } catch {
      postgres = false;
    }
    try {
      redisOk = (await redis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }
    let rabbitmq = queueInline() ? "inline" : "down";
    if (!queueInline()) {
      rabbitmq = (await rabbitReachable()) ? "up" : "down";
    }
    const ok = postgres && redisOk;
    res.status(ok ? 200 : 503).json({
      ok,
      service: "volt-co-api",
      postgres,
      redis: redisOk,
      rabbitmq,
    });
  }),
);

healthRouter.get(
  "/limited",
  rateLimit("test", 5, 0.01),
  (_req, res) => {
    res.json({ ok: true });
  },
);
