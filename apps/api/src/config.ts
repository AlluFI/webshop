import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiRoot, "../..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(apiRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

export const config = {
  port: number("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresSec: number("JWT_ACCESS_EXPIRES_SEC", 900),
  jwtRefreshExpiresSec: number("JWT_REFRESH_EXPIRES_SEC", 60 * 60 * 24 * 7),
  mailHost: process.env.MAIL_HOST ?? "127.0.0.1",
  mailPort: number("MAIL_PORT", 1025),
  mailFrom: process.env.MAIL_FROM ?? "Volt & Co <no-reply@localhost>",
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:5173",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  dataEncryptionKey:
    process.env.DATA_ENCRYPTION_KEY ?? "dev_data_encryption_key_must_be_32chars!",
  recaptchaSecret: process.env.RECAPTCHA_SECRET ?? "",
  oauthCallbackBase:
    process.env.OAUTH_CALLBACK_BASE ?? "http://localhost:3000/api/v1/auth",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  rabbitmqUrl: process.env.RABBITMQ_URL ?? "",
  queueInline: process.env.QUEUE_INLINE === "true" || !process.env.RABBITMQ_URL,
  nodeEnv: process.env.NODE_ENV ?? "development",
  postiMode: process.env.POSTI_MODE === "live" ? "live" : "mock",
  postiClientId: process.env.POSTI_CLIENT_ID ?? "",
  postiClientSecret: process.env.POSTI_CLIENT_SECRET ?? "",
  postiOauthUrl: process.env.POSTI_OAUTH_URL ?? "https://oauth2.posti.com/oauth/token",
  postiShipmentUrl: process.env.POSTI_SHIPMENT_URL ?? "https://nextshipping.posti.fi/prinetti/create-shipment",
  postiLabelUrl: process.env.POSTI_LABEL_URL ?? "https://nextshipping.posti.fi/prinetti/get-shipping-label",
  postnordMode: process.env.POSTNORD_MODE === "live" ? "live" : "mock",
  postnordClientId: process.env.POSTNORD_CLIENT_ID ?? "",
  postnordClientSecret: process.env.POSTNORD_CLIENT_SECRET ?? "",
  postnordOauthUrl:
    process.env.POSTNORD_OAUTH_URL ?? "https://api2.postnord.com/oauth2/token",
  postnordBookingUrl:
    process.env.POSTNORD_BOOKING_URL ?? "https://api2.postnord.com/rest/booking/v1/bookings",
  postnordLabelUrl:
    process.env.POSTNORD_LABEL_URL ?? "https://api2.postnord.com/rest/booking/v1/labels",
  budbeeMode: process.env.BUDBEE_MODE === "live" ? "live" : "mock",
  budbeeApiKey: process.env.BUDBEE_API_KEY ?? "",
  budbeeApiSecret: process.env.BUDBEE_API_SECRET ?? "",
  budbeeBaseUrl: process.env.BUDBEE_BASE_URL ?? "https://api.staging.budbee.com",
  budbeeCollectionId: number("BUDBEE_COLLECTION_ID", 0),
  ticketMode: process.env.TICKET_MODE === "live" ? "live" : "mock",
  ticketWebhookUrl: process.env.TICKET_WEBHOOK_URL ?? "",
  assistantLlmProvider: (process.env.ASSISTANT_LLM_PROVIDER ?? "").toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  assistantModel: process.env.ASSISTANT_MODEL ?? "",
};

if (config.jwtAccessSecret.length < 32 || config.jwtRefreshSecret.length < 32) {
  throw new Error("JWT secrets must be at least 32 characters");
}
if (config.dataEncryptionKey.length < 32) {
  throw new Error("DATA_ENCRYPTION_KEY must be at least 32 characters");
}
