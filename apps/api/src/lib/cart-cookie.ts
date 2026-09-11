import type { CookieOptions, Request, Response } from "express";
import { config } from "../config.js";

export const CART_COOKIE = "cart_token";
export const CART_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const cookieBase: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.cookieSecure,
  path: "/api/v1",
};

export function readCartCookie(req: Request): string | undefined {
  const fromParser = req.cookies?.[CART_COOKIE];
  if (typeof fromParser === "string" && fromParser.length > 0) return fromParser;
  const source = req.headers.cookie;
  if (!source) return undefined;
  const parts = source.split(";").map((part) => part.trim());
  const item = parts.find((part) => part.startsWith(`${CART_COOKIE}=`));
  if (!item) return undefined;
  return decodeURIComponent(item.slice(CART_COOKIE.length + 1));
}

export type CartCookieAction =
  | { type: "set"; token: string }
  | { type: "clear" }
  | { type: "keep" };

export function applyCartCookie(res: Response, action: CartCookieAction) {
  if (action.type === "set") {
    res.cookie(CART_COOKIE, action.token, { ...cookieBase, maxAge: CART_COOKIE_MAX_AGE_MS });
  } else if (action.type === "clear") {
    res.clearCookie(CART_COOKIE, cookieBase);
  }
}
