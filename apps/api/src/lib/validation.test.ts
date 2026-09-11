import { describe, expect, it } from "vitest";
import { addressSchema, checkoutValidateSchema, loginSchema, registerSchema } from "@volt/shared";

describe("user input validation", () => {
  it("accepts a well-formed registration payload", () => {
    const parsed = registerSchema.parse({
      email: "Alex@Volt.test",
      password: "Shopping123",
      displayName: "Alex",
      captchaToken: "token",
    });
    expect(parsed.email).toBe("alex@volt.test");
  });

  it("rejects a weak password and invalid email with field messages", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "short",
      captchaToken: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("email");
      expect(fields).toContain("password");
      expect(fields).toContain("captchaToken");
    }
  });

  it("requires a password on login", () => {
    const result = loginSchema.safeParse({ email: "a@volt.test", password: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a Finnish shipping address and rejects a bad postcode", () => {
    const valid = addressSchema.parse({
      recipientName: "Aino Korhonen",
      line1: "Mannerheimintie 12",
      city: "Helsinki",
      postal: "00100",
      country: "FI",
      phone: "+358401234567",
    });
    expect(valid.city).toBe("Helsinki");
    const bad = addressSchema.safeParse({
      recipientName: "Aino Korhonen",
      line1: "Mannerheimintie 12",
      city: "Helsinki",
      postal: "ABC",
      country: "FI",
    });
    expect(bad.success).toBe(false);
  });

  it("requires identity, phone, and an address to validate checkout", () => {
    const identity = checkoutValidateSchema.safeParse({
      email: "not-an-email",
      displayName: "",
      phone: "12",
      shippingMethod: "standard",
    });
    expect(identity.success).toBe(false);
    if (!identity.success) {
      const fields = identity.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("email");
      expect(fields).toContain("displayName");
      expect(fields).toContain("phone");
    }

    const missingAddress = checkoutValidateSchema.safeParse({
      email: "guest@volt.test",
      displayName: "Guest",
      phone: "+358401234567",
      shippingMethod: "standard",
    });
    expect(missingAddress.success).toBe(false);
    if (!missingAddress.success) {
      expect(missingAddress.error.issues.map((issue) => issue.path[0])).toContain("address");
    }
  });
});
