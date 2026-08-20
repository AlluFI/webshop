import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { filesRouter } from "./routes/files.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  mkdirSync(config.uploadDir, { recursive: true });

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: [
        config.webAppUrl,
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8088",
      ],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", catalogRouter);
  app.use("/api/v1/files", filesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
