import { describe, expect, it } from "vitest";
import { decrypt, encrypt, encryptJson, decryptJson } from "./crypto.js";

describe("at-rest encryption", () => {
  it("round-trips plaintext with AES-256-GCM", () => {
    const cipher = encrypt("12 Mannerheimintie");
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain("Mannerheimintie");
    expect(decrypt(cipher)).toBe("12 Mannerheimintie");
  });

  it("produces different ciphertext for the same input", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("round-trips JSON snapshots", () => {
    const snapshot = { city: "Helsinki", postal: "00100" };
    expect(decryptJson(encryptJson(snapshot))).toEqual(snapshot);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encrypt("secret-address");
    const broken = `${cipher.slice(0, -2)}aa`;
    expect(() => decrypt(broken)).toThrow();
  });
});
