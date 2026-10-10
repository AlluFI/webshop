import { Router } from "express";
import { refreshSchema } from "@volt/shared";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { authService } from "../services/auth.service.js";
import { googleAuthUrl, googleCallback, googleConfigured } from "../services/oauth.service.js";
import { authRateLimit } from "../lib/rate-limit.js";

export const authRouter = Router();

function setRefreshCookie(res: { cookie: Function }, refreshToken: string) {
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/api/v1/auth",
    maxAge: config.jwtRefreshExpiresSec * 1000,
  });
}

function clearRefreshCookie(res: { clearCookie: Function }) {
  res.clearCookie("refresh_token", {
    path: "/api/v1/auth",
    sameSite: "lax",
    secure: config.cookieSecure,
    httpOnly: true,
  });
}

function cookieValue(req: { headers: { cookie?: string } }, name: string) {
  const source = req.headers.cookie;
  if (!source) return undefined;
  const parts = source.split(";").map((part) => part.trim());
  const item = parts.find((part) => part.startsWith(`${name}=`));
  if (!item) return undefined;
  return decodeURIComponent(item.slice(name.length + 1));
}

function bearer(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}

authRouter.post(
  "/register",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    res.json(await authService.verifyEmail(req.body));
  }),
);

authRouter.post(
  "/login",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    if ("refreshToken" in result) {
      setRefreshCookie(res, result.refreshToken);
    }
    res.json(result);
  }),
);

authRouter.post(
  "/mfa/complete",
  asyncHandler(async (req, res) => {
    const result = await authService.completeMfa(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const token = req.body.refreshToken || cookieValue(req, "refresh_token");
    if (!token) throw new HttpError(400, "Missing refresh token");
    const result = await authService.refresh(token);
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken || cookieValue(req, "refresh_token");
    await authService.logout(token, bearer(req));
    clearRefreshCookie(res);
    res.json({ message: "Session revoked." });
  }),
);

authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    await authService.logoutAll(user.id, bearer(req));
    clearRefreshCookie(res);
    res.json({ message: "All sessions revoked." });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.me((req as AuthedRequest).user.id));
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.updateProfile((req as AuthedRequest).user.id, req.body));
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    res.json(await authService.forgotPassword(req.body));
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    res.json(await authService.resetPassword(req.body));
  }),
);

authRouter.post(
  "/totp/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await authService.totpSetup(user.id, user.email));
  }),
);

authRouter.post(
  "/totp/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await authService.totpConfirm(user.id, req.body));
  }),
);

authRouter.post(
  "/totp/disable",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await authService.totpDisable(user.id, req.body));
  }),
);

authRouter.get(
  "/google",
  asyncHandler(async (_req, res) => {
    res.redirect(await googleAuthUrl());
  }),
);

authRouter.get("/google/status", (_req, res) => {
  res.json({ configured: googleConfigured() });
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code || !state) {
      throw new HttpError(400, "Missing OAuth code or state");
    }
    const pair = await googleCallback(code, state);
    setRefreshCookie(res, pair.refreshToken);
    const dest = `${config.webAppUrl.replace(/\/$/, "")}/oauth/callback`;
    res.redirect(dest);
  }),
);
