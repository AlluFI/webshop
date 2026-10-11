// AES-256-GCM for PII at rest (addresses, order contact, payment metadata, refresh JTIs).
// Format: v1:<iv>:<tag>:<ciphertext> (base64url). Key is SHA-256(DATA_ENCRYPTION_KEY).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY ?? "dev_data_encryption_key_must_be_32chars!";
  if (raw.length < 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be at least 32 characters");
  }
  return createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Unrecognized ciphertext");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const encrypted = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function encryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

export function decryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return decrypt(value);
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/** TOTP secrets and similar: decrypt AES-GCM, or return legacy plaintext. */
export function revealSecret(value: string) {
  if (value.startsWith(`${PREFIX}:`)) return decrypt(value);
  return value;
}
