import type { NextFunction, Request, Response } from "express";
import { tokens } from "../services/tokens.js";
import { asyncHandler } from "./error-handler.js";
import { HttpError } from "../http-error.js";

export type AuthedRequest = Request & {
  user: { id: string; email: string; role: string; jti: string };
};

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Sign in to continue");
  }
  const payload = await tokens.assertAccessUsable(header.slice(7));
  (req as AuthedRequest).user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    jti: payload.jti,
  };
  next();
});

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  void tokens
    .assertAccessUsable(header.slice(7))
    .then((payload) => {
      (req as AuthedRequest).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: payload.jti,
      };
      next();
    })
    .catch(() => next());
}
