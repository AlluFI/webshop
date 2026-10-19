import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { catalogRouter } from "./routes/catalog.js";
import { cartRouter } from "./routes/cart.js";
import { addressRouter } from "./routes/addresses.js";
import { checkoutRouter } from "./routes/checkout.js";
import { ordersRouter } from "./routes/orders.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { filesRouter } from "./routes/files.js";
import { docsRouter } from "./routes/docs.js";
import { reviewsRouter } from "./routes/reviews.js";
import { contactRouter } from "./routes/contact.js";
import { shippingRouter } from "./routes/shipping.js";
import { adminRouter } from "./routes/admin.js";
import { integrationsRouter } from "./routes/integrations.js";
import { assistantRouter } from "./routes/assistant.js";
import { errorHandler } from "./middleware/error-handler.js";
import { setPaymentStatusHandler } from "./lib/queue.js";
import { handlePaymentStatus } from "./services/order-fulfillment.js";
import { apiRateLimit } from "./lib/rate-limit.js";

export function createApp() {
  mkdirSync(config.uploadDir, { recursive: true });
  setPaymentStatusHandler(handlePaymentStatus);

  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: [
        config.webAppUrl,
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8088",
        "https://localhost:8443",
      ],
      credentials: true,
    }),
  );
  // Stripe needs the raw body for signature verification — mount before json().
  app.use("/api/v1/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api/v1", apiRateLimit);

  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/account", accountRouter);
  app.use("/api/v1", catalogRouter);
  app.use("/api/v1/cart", cartRouter);
  app.use("/api/v1/addresses", addressRouter);
  app.use("/api/v1/checkout", checkoutRouter);
  app.use("/api/v1/orders", ordersRouter);
  app.use("/api/v1/files", filesRouter);
  app.use("/api/v1", reviewsRouter);
  app.use("/api/v1/contact", contactRouter);
  app.use("/api/v1/shipping", shippingRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/integrations/v1", integrationsRouter);
  app.use("/api/v1/assistant", assistantRouter);
  app.use("/api/v1", docsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
