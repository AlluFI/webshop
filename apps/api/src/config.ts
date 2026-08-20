import "dotenv/config";

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
  recaptchaSecret: process.env.RECAPTCHA_SECRET ?? "",
  oauthCallbackBase:
    process.env.OAUTH_CALLBACK_BASE ?? "http://localhost:3000/api/v1/auth",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
};

if (config.jwtAccessSecret.length < 32 || config.jwtRefreshSecret.length < 32) {
  throw new Error("JWT secrets must be at least 32 characters");
}
