import {
  COMPARE_LIMIT,
  STORE_LOCALES,
  stockAlertSchema,
  wishlistItemSchema,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { encrypt, decryptOrEmpty } from "../lib/crypto.js";
import { sha256Hex } from "../lib/hash.js";
import { mail } from "../mail.js";
import { catalogService } from "./catalog.service.js";

function emailHash(email: string) {
  return sha256Hex(email.trim().toLowerCase());
}

export const shopService = {
  config() {
    return {
      i18nEnabled: config.i18nEnabled,
      locales: STORE_LOCALES,
      defaultLocale: "en" as const,
      compareLimit: COMPARE_LIMIT,
    };
  },

  async listWishlist(userId: string) {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { productId: true },
    });
    const items = [];
    for (const row of rows) {
      try {
        items.push(await catalogService.byIdOrSlug(row.productId));
      } catch {
        // product removed
      }
    }
    return { items };
  },

  async addWishlist(userId: string, input: unknown) {
    const dto = wishlistItemSchema.parse(input);
    const product = await prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true } });
    if (!product) throw new HttpError(404, "Product not found");
    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      update: {},
      create: { userId, productId: dto.productId },
    });
    return this.listWishlist(userId);
  },

  async removeWishlist(userId: string, productId: string) {
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return this.listWishlist(userId);
  },

  async subscribeStock(input: unknown) {
    const dto = stockAlertSchema.parse(input);
    const product = await prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, name: true, stockQuantity: true },
    });
    if (!product) throw new HttpError(404, "Product not found");
    if (product.stockQuantity > 0) {
      throw new HttpError(409, "This product is already in stock.");
    }
    const hash = emailHash(dto.email);
    await prisma.stockAlert.upsert({
      where: { productId_emailHash: { productId: dto.productId, emailHash: hash } },
      update: { notifiedAt: null, emailEnc: encrypt(dto.email) },
      create: {
        productId: dto.productId,
        emailEnc: encrypt(dto.email),
        emailHash: hash,
      },
    });
    return { subscribed: true, productName: product.name };
  },

  async notifyRestock(productId: string, previousQty: number, nextQty: number) {
    if (!(previousQty <= 0 && nextQty > 0)) return { sent: 0 };
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true },
    });
    if (!product) return { sent: 0 };
    const alerts = await prisma.stockAlert.findMany({
      where: { productId, notifiedAt: null },
    });
    if (!alerts.length) return { sent: 0 };
    const url = `${config.webAppUrl.replace(/\/$/, "")}/products/${product.slug}`;
    let sent = 0;
    for (const alert of alerts) {
      const email = decryptOrEmpty(alert.emailEnc);
      if (!email) continue;
      await mail.sendBackInStock({ email, productName: product.name, productUrl: url });
      await prisma.stockAlert.update({
        where: { id: alert.id },
        data: { notifiedAt: new Date() },
      });
      sent += 1;
    }
    return { sent };
  },
};
