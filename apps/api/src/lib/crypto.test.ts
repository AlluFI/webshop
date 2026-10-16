import { describe, expect, it } from "vitest";
import { decrypt, decryptOrEmpty, encrypt, encryptJson, decryptJson, revealSecret } from "./crypto.js";

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
    expect(revealSecret(cipher)).toBe("secret-address");
    expect(revealSecret("legacy-plain-totp")).toBe("legacy-plain-totp");
    const broken = `${cipher.slice(0, -2)}aa`;
    expect(() => decrypt(broken)).toThrow();
    expect(decryptOrEmpty(broken)).toBe("");
  });

  it("reads ciphertext written with the default dev key after the env key changes", () => {
    const previous = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = "dev_data_encryption_key_must_be_32chars!";
    const cipher = encrypt("Demo Customer");
    process.env.DATA_ENCRYPTION_KEY = "another_data_encryption_key_32chars_min!";
    expect(decrypt(cipher)).toBe("Demo Customer");
    if (previous == null) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = previous;
  });
});
