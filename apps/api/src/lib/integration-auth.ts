import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { IntegrationScope } from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { sha256Hex } from "./hash.js";
import { asyncHandler } from "../middleware/error-handler.js";

export type IntegrationRequest = Request & {
  integrationKey: {
    id: string;
    name: string;
    scopes: string[];
  };
};

function readPresentedKey(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ") && header.slice(7).startsWith("volt_")) {
    return header.slice(7).trim();
  }
  const named = req.headers["x-api-key"];
  if (typeof named === "string" && named.startsWith("volt_")) return named.trim();
  return "";
}

export function requireIntegrationScope(scope: IntegrationScope) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const presented = readPresentedKey(req);
    if (!presented) {
      throw new HttpError(401, "Send an integration API key as Authorization: Bearer or X-Api-Key.");
    }
    const row = await prisma.integrationApiKey.findUnique({
      where: { keyHash: sha256Hex(presented) },
    });
    if (!row || row.revokedAt) {
      throw new HttpError(401, "Invalid or revoked integration key.");
    }
    if (!row.scopes.includes(scope)) {
      throw new HttpError(403, `This key cannot access ${scope}.`);
    }
    await prisma.integrationApiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    (req as IntegrationRequest).integrationKey = {
      id: row.id,
      name: row.name,
      scopes: row.scopes,
    };
    next();
  });
}

export function hasPiiScope(req: Request) {
  return Boolean((req as IntegrationRequest).integrationKey?.scopes.includes("pii"));
}

export function signIntegrationPayload(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyIntegrationSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
) {
  const expected = signIntegrationPayload(secret, timestamp, body);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
