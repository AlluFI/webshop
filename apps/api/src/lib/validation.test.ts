import { describe, expect, it } from "vitest";
import {
  addressSchema,
  adminCreateEmployeeSchema,
  adminUserListQuerySchema,
  checkoutValidateSchema,
  customerRefundRequestSchema,
  loginSchema,
  registerSchema,
  staffRefundRequestSchema,
} from "@volt/shared";

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

  it("requires a refund reason and a note when the reason is Other", () => {
    expect(customerRefundRequestSchema.safeParse({}).success).toBe(false);
    expect(customerRefundRequestSchema.parse({ reason: "changed_mind" }).reason).toBe("changed_mind");
    expect(customerRefundRequestSchema.safeParse({ reason: "other" }).success).toBe(false);
    expect(customerRefundRequestSchema.parse({ reason: "other", note: "Cracked case" }).note).toBe(
      "Cracked case",
    );
    expect(staffRefundRequestSchema.parse({ reason: "shop_error" }).reason).toBe("shop_error");
    expect(customerRefundRequestSchema.safeParse({ reason: "shop_error" }).success).toBe(false);
  });

  it("creates staff employees and rejects customer or weak passwords", () => {
    const parsed = adminCreateEmployeeSchema.parse({
      email: "Hire@Volt.test",
      password: "Shopping123",
      displayName: "New Hire",
      role: "warehouse",
    });
    expect(parsed.email).toBe("hire@volt.test");
    expect(adminCreateEmployeeSchema.safeParse({ ...parsed, role: "customer" }).success).toBe(false);
    expect(adminCreateEmployeeSchema.safeParse({ ...parsed, password: "short" }).success).toBe(false);
  });

  it("filters users by one role or all employees", () => {
    expect(adminUserListQuerySchema.parse({ role: "warehouse" }).role).toBe("warehouse");
    expect(adminUserListQuerySchema.parse({ role: "staff" }).role).toBe("staff");
    expect(adminUserListQuerySchema.parse({ role: "" }).role).toBeUndefined();
    expect(adminUserListQuerySchema.safeParse({ role: "manager" }).success).toBe(false);
  });
});
