import { authenticator } from "otplib";
import QRCode from "qrcode";
import {
  forgotPasswordSchema,
  isStaffRole,
  loginSchema,
  mfaCompleteSchema,
  registerSchema,
  resetPasswordSchema,
  totpConfirmSchema,
  totpDisableSchema,
  verifyEmailSchema,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { redis } from "../redis.js";
import { mail } from "../mail.js";
import { HttpError } from "../http-error.js";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../lib/hash.js";
import { verifyCaptcha } from "../lib/captcha.js";
import { tokens } from "./tokens.js";
import { config } from "../config.js";
import jwt from "jsonwebtoken";
import { encrypt, revealSecret } from "../lib/crypto.js";
import { updateProfileSchema } from "@volt/shared";

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const TOTP_SETUP_TTL_SEC = 600;
const MFA_TOKEN_SEC = 300;
const BACKUP_CODE_COUNT = 10;

function publicUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  totpEnabled: boolean;
  emailVerifiedAt: Date | null;
  role: { name: string };
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    totpEnabled: user.totpEnabled,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role.name,
  };
}

async function customerRoleId() {
  const role = await prisma.role.upsert({
    where: { name: "customer" },
    update: {},
    create: { name: "customer" },
  });
  return role.id;
}

function backupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomToken(4).slice(0, 8).toUpperCase(),
  );
}

export const authService = {
  async register(input: unknown) {
    const dto = registerSchema.parse(input);
    await verifyCaptcha(dto.captchaToken);
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new HttpError(409, "An account with this email already exists.", {
        email: "An account with this email already exists.",
      });
    }
    const user = await prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName ?? null,
        passwordHash: await hashPassword(dto.password),
        roleId: await customerRoleId(),
      },
    });
    const token = randomToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    await mail.sendVerification(user.email, token);
    return {
      message: "Registration successful. Check your email to verify your account.",
      userId: user.id,
      ...(config.nodeEnv === "test" ? { verifyToken: token } : {}),
    };
  },

  async verifyEmail(input: unknown) {
    const { token } = verifyEmailSchema.parse(input);
    const record = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash: sha256Hex(token), expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!record) {
      throw new HttpError(400, "Invalid or expired verification token.");
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } }),
    ]);
    return { message: "Email verified successfully." };
  },

  async login(input: unknown) {
    const dto = loginSchema.parse(input);
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });
    if (!user?.passwordHash) {
      throw new HttpError(401, "Invalid email or password.");
    }
    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      throw new HttpError(401, "Invalid email or password.");
    }
    if (!user.emailVerifiedAt) {
      throw new HttpError(401, "Please verify your email before signing in.");
    }
    if (isStaffRole(user.role.name) && !user.totpEnabled) {
      throw new HttpError(
        403,
        "Staff accounts must enable two-factor authentication before signing in.",
      );
    }
    if (user.totpEnabled) {
      const mfaToken = jwt.sign(
        { sub: user.id, typ: "mfa" },
        config.jwtAccessSecret,
        { expiresIn: MFA_TOKEN_SEC },
      );
      return {
        mfaRequired: true as const,
        mfaToken,
        mfaExpiresInSec: MFA_TOKEN_SEC,
      };
    }
    return this.issuePair(user.id, user.email, user.role.name);
  },

  async completeMfa(input: unknown) {
    const dto = mfaCompleteSchema.parse(input);
    let userId: string;
    try {
      const payload = jwt.verify(dto.mfaToken, config.jwtAccessSecret) as jwt.JwtPayload;
      if (payload.typ !== "mfa" || typeof payload.sub !== "string") {
        throw new Error("bad");
      }
      userId = payload.sub;
    } catch {
      throw new HttpError(401, "Invalid or expired MFA token");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { totpSecret: true, role: true },
    });
    if (!user?.totpEnabled || !user.totpSecret?.secret) {
      throw new HttpError(400, "Two-factor authentication is not active.");
    }
    if (dto.totpCode) {
      let secret: string;
      try {
        secret = revealSecret(user.totpSecret.secret);
      } catch {
        throw new HttpError(401, "Invalid authenticator code");
      }
      const ok = authenticator.verify({
        token: dto.totpCode,
        secret,
      });
      if (!ok) throw new HttpError(401, "Invalid authenticator code");
    } else if (dto.backupCode) {
      const raw = dto.backupCode.trim().toUpperCase();
      const hashes = (user.totpSecret.backupCodes as string[] | null) ?? [];
      const match = sha256Hex(raw);
      if (!hashes.includes(match)) {
        throw new HttpError(401, "Invalid backup code");
      }
      await prisma.totpSecret.update({
        where: { userId: user.id },
        data: { backupCodes: hashes.filter((h) => h !== match) },
      });
    }
    return this.issuePair(user.id, user.email, user.role.name);
  },

  async issuePair(userId: string, email: string, role: string) {
    const pair = await tokens.createSession(userId, email, role);
    return {
      userId,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: "Bearer" as const,
    };
  },

  async refresh(refreshToken: string) {
    let userId: string;
    try {
      const { verifyRefreshToken } = await import("../lib/jwt.js");
      userId = verifyRefreshToken(refreshToken, config.jwtRefreshSecret).sub;
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new HttpError(401, "Invalid refresh token");
    const rotated = await tokens.rotate(refreshToken, user.email, user.role.name);
    return {
      userId: user.id,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      tokenType: "Bearer" as const,
    };
  },

  async logout(refreshToken: string | undefined, accessToken: string | undefined) {
    if (accessToken) await tokens.denyAccessToken(accessToken);
    if (refreshToken) await tokens.revokeRefresh(refreshToken);
    return { message: "Session revoked." };
  },

  async logoutAll(userId: string, accessToken?: string) {
    if (accessToken) await tokens.denyAccessToken(accessToken);
    await tokens.revokeAll(userId);
    return { message: "All sessions revoked." };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new HttpError(401, "Sign in to continue");
    return publicUser(user);
  },

  async updateProfile(userId: string, input: unknown) {
    const dto = updateProfileSchema.parse(input);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { displayName: dto.displayName },
      include: { role: true },
    });
    return publicUser(user);
  },

  async forgotPassword(input: unknown) {
    const { email } = forgotPasswordSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      await mail.sendPasswordReset(user.email, token);
    }
    return {
      message: "If that email is registered, we sent a reset link.",
    };
  },

  async resetPassword(input: unknown) {
    const dto = resetPasswordSchema.parse(input);
    const record = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: sha256Hex(dto.token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) {
      throw new HttpError(400, "Invalid or expired reset token.");
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(dto.password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await tokens.revokeAll(record.userId);
    return { message: "Password updated. You can sign in with your new password." };
  },

  async totpSetup(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    await redis.set(`totp-setup:${userId}`, secret, "EX", TOTP_SETUP_TTL_SEC);
    const otpauth = authenticator.keyuri(email, "Volt & Co", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { otpauth, qrDataUrl, secret };
  },

  async totpConfirm(userId: string, input: unknown) {
    const { code } = totpConfirmSchema.parse(input);
    const secret = await redis.get(`totp-setup:${userId}`);
    if (!secret) {
      throw new HttpError(400, "Two-factor setup expired. Start again.");
    }
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) throw new HttpError(400, "Invalid authenticator code");
    const codes = backupCodes();
    await prisma.$transaction([
      prisma.totpSecret.upsert({
        where: { userId },
        update: {
          secret: encrypt(secret),
          confirmedAt: new Date(),
          backupCodes: codes.map(sha256Hex),
        },
        create: {
          userId,
          secret: encrypt(secret),
          confirmedAt: new Date(),
          backupCodes: codes.map(sha256Hex),
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { totpEnabled: true },
      }),
    ]);
    await redis.del(`totp-setup:${userId}`);
    return {
      message: "Two-factor authentication is on. Store these backup codes.",
      backupCodes: codes,
    };
  },

  async totpDisable(userId: string, input: unknown) {
    const { code } = totpDisableSchema.parse(input);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { totpSecret: true, role: true },
    });
    if (!user?.totpSecret?.secret || !user.totpEnabled) {
      throw new HttpError(400, "Two-factor authentication is not active.");
    }
    if (isStaffRole(user.role.name)) {
      throw new HttpError(403, "Staff accounts cannot disable two-factor authentication.");
    }
    let secret: string;
    try {
      secret = revealSecret(user.totpSecret.secret);
    } catch {
      throw new HttpError(401, "Invalid authenticator code");
    }
    const ok = authenticator.verify({
      token: code,
      secret,
    });
    if (!ok) throw new HttpError(401, "Invalid authenticator code");
    await prisma.$transaction([
      prisma.totpSecret.delete({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { totpEnabled: false } }),
    ]);
    return { message: "Two-factor authentication is off." };
  },

  async upsertOAuthUser(params: {
    provider: string;
    providerUserId: string;
    email: string;
    displayName?: string;
  }) {
    const email = params.email.trim().toLowerCase();
    const existingLink = await prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: params.provider,
          providerUserId: params.providerUserId,
        },
      },
    });
    if (existingLink) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: existingLink.userId },
        include: { role: true },
      });
      return user;
    }
    let user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          displayName: params.displayName ?? null,
          emailVerifiedAt: new Date(),
          roleId: await customerRoleId(),
          oauthIdentities: {
            create: {
              provider: params.provider,
              providerUserId: params.providerUserId,
            },
          },
        },
        include: { role: true },
      });
    } else {
      await prisma.oAuthIdentity.create({
        data: {
          userId: user.id,
          provider: params.provider,
          providerUserId: params.providerUserId,
        },
      });
      if (!user.emailVerifiedAt) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
          include: { role: true },
        });
      }
    }
    return user;
  },
};
