import jwt from "jsonwebtoken";

export type AccessPayload = {
  sub: string;
  email: string;
  role: string;
  jti: string;
  typ: "access";
  iat?: number;
  exp?: number;
};

export type RefreshPayload = {
  sub: string;
  fam: string;
  jti: string;
  typ: "refresh";
};

export function signAccessToken(
  payload: Omit<AccessPayload, "typ" | "iat" | "exp">,
  secret: string,
  expiresInSec: number,
) {
  return jwt.sign({ ...payload, typ: "access" }, secret, {
    expiresIn: expiresInSec,
  });
}

export function verifyAccessToken(token: string, secret: string): AccessPayload {
  const payload = jwt.verify(token, secret) as jwt.JwtPayload;
  if (
    payload.typ !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }
  return payload as AccessPayload;
}

export function decodeAccessTokenUnverified(token: string): AccessPayload | null {
  const payload = jwt.decode(token) as jwt.JwtPayload | null;
  if (!payload || typeof payload.sub !== "string") return null;
  return payload as AccessPayload;
}

export function signRefreshToken(
  payload: Omit<RefreshPayload, "typ">,
  secret: string,
  expiresInSec: number,
) {
  return jwt.sign({ ...payload, typ: "refresh" }, secret, {
    expiresIn: expiresInSec,
  });
}

export function verifyRefreshToken(token: string, secret: string): RefreshPayload {
  const payload = jwt.verify(token, secret) as jwt.JwtPayload;
  if (
    payload.typ !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.fam !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid refresh token payload");
  }
  return payload as RefreshPayload;
}

export function remainingTtlSec(payload: { exp?: number }) {
  if (!payload.exp) return 60;
  return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
}
