import { describe, expect, it } from "vitest";
import { signIntegrationPayload, verifyIntegrationSignature } from "./integration-auth.js";

describe("integration webhook signatures", () => {
  it("signs timestamp.payload with HMAC-SHA256", () => {
    const body = JSON.stringify({ type: "order.paid", data: { id: "1" } });
    const signature = signIntegrationPayload("whsec_test", "1710000000", body);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyIntegrationSignature("whsec_test", "1710000000", body, signature)).toBe(true);
  });

  it("rejects a tampered body or secret", () => {
    const body = '{"ok":true}';
    const signature = signIntegrationPayload("whsec_test", "1710000000", body);
    expect(verifyIntegrationSignature("whsec_test", "1710000000", '{"ok":false}', signature)).toBe(false);
    expect(verifyIntegrationSignature("other", "1710000000", body, signature)).toBe(false);
    expect(verifyIntegrationSignature("whsec_test", "1710000000", body, "ab")).toBe(false);
  });
});
