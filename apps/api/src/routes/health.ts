import { Router } from "express";
import { prisma } from "../prisma.js";
import { redis } from "../redis.js";
import { asyncHandler } from "../middleware/error-handler.js";

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
    const ok = postgres && redisOk;
    res.status(ok ? 200 : 503).json({
      ok,
      service: "volt-co-api",
      postgres,
      redis: redisOk,
    });
  }),
);
