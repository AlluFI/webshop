import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Add at least one uppercase letter")
  .regex(/[a-z]/, "Add at least one lowercase letter")
  .regex(/[0-9]/, "Add at least one number");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .max(254, "Email is too long")
  .transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  marketingOptIn: z.boolean().optional().default(false),
  captchaToken: z.string().min(1, "Complete the CAPTCHA to create an account"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});

export const mfaCompleteSchema = z
  .object({
    mfaToken: z.string().min(1, "MFA token is required"),
    totpCode: z.string().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
    backupCode: z.string().min(8).max(16).optional(),
  })
  .refine((value) => Boolean(value.totpCode || value.backupCode), {
    message: "Provide an authenticator code or a backup code",
    path: ["totpCode"],
  });

export const totpConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code"),
});

export const totpDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code"),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  marketingOptIn: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
