import { randomToken } from "../lib/hash.js";
import { redis } from "../redis.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { authService } from "./auth.service.js";

const STATE_TTL = 300;

export function googleConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export async function googleAuthUrl() {
  if (!googleConfigured()) {
    throw new HttpError(
      503,
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
  const state = randomToken(16);
  await redis.set(`oauth:google:${state}`, "1", "EX", STATE_TTL);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", `${config.oauthCallbackBase}/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function googleCallback(code: string, state: string) {
  if (!googleConfigured()) {
    throw new HttpError(503, "Google sign-in is not configured.");
  }
  const expected = await redis.get(`oauth:google:${state}`);
  if (!expected) {
    throw new HttpError(400, "Invalid or expired OAuth state. Try again.");
  }
  await redis.del(`oauth:google:${state}`);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${config.oauthCallbackBase}/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new HttpError(401, "Google did not accept this sign-in. Try again.");
  }
  const tokensJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokensJson.access_token) {
    throw new HttpError(401, "Google did not return an access token.");
  }
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokensJson.access_token}` },
  });
  if (!profileRes.ok) {
    throw new HttpError(401, "Could not read your Google profile.");
  }
  const profile = (await profileRes.json()) as {
    id?: string;
    email?: string;
    name?: string;
    verified_email?: boolean;
  };
  if (!profile.id || !profile.email) {
    throw new HttpError(400, "Google did not provide an email address.");
  }
  const user = await authService.upsertOAuthUser({
    provider: "google",
    providerUserId: profile.id,
    email: profile.email,
    displayName: profile.name,
  });
  return authService.issuePair(user.id, user.email, user.role.name);
}
