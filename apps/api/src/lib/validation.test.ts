import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@volt/shared";

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
});
