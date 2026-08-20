import { config } from "../config.js";
import { HttpError } from "../http-error.js";

const TEST_BYPASS = "test-captcha-token";

export async function verifyCaptcha(token: string) {
  if (config.nodeEnv === "test" && token === TEST_BYPASS) {
    return;
  }
  if (!config.recaptchaSecret) {
    throw new HttpError(500, "CAPTCHA is not configured on the server");
  }
  const body = new URLSearchParams({
    secret: config.recaptchaSecret,
    response: token,
  });
  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as { success?: boolean };
  if (!data.success) {
    throw new HttpError(400, "CAPTCHA verification failed. Please try again.");
  }
}
