import { defineConfig } from "vitest/config";

const secret = "test_jwt_access_secret_change_me_32ch";
const refresh = "test_refresh_secret_must_be_32_chars_ok";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:15432/voltco?schema=public",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      JWT_ACCESS_SECRET: secret,
      JWT_REFRESH_SECRET: refresh,
      JWT_ACCESS_EXPIRES_SEC: "900",
      JWT_REFRESH_EXPIRES_SEC: "604800",
      MAIL_HOST: process.env.MAIL_HOST ?? "127.0.0.1",
      MAIL_PORT: process.env.MAIL_PORT ?? "10250",
      WEB_APP_URL: "http://localhost:5173",
      COOKIE_SECURE: "false",
      UPLOAD_DIR: process.env.UPLOAD_DIR ?? "uploads",
    },
  },
});
