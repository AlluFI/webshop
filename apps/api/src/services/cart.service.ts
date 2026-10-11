import type { Prisma } from "@prisma/client";
import { addCartItemSchema, updateCartItemSchema } from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { decryptJson } from "../lib/crypto.js";
import { randomToken, sha256Hex } from "../lib/hash.js";
import { cartSubtotal, clampQuantity, lineTotal } from "../lib/cart-math.js";
import type { CartCookieAction } from "../lib/cart-cookie.js";
import { catalogService } from "./catalog.service.js";

const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const itemInclude = {
  product: {
    include: {
      images: { orderBy: { sortOrder: "asc" as const } },
    },
  },
} as const;

type CartRecord = Prisma.CartGetPayload<{ include: { items: { include: typeof itemInclude } } }>;

export type CartContext = {
  userId?: string;
  guestTokenRaw?: string;
};

function money(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function toDto(cart: CartRecord, warnings: { productId: string; message: string }[] = []) {
  const items = cart.items.map((item) => {
    const price = money(item.product.price);
    const image = item.product.images[0];
    return {
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      slug: item.product.slug,
      price,
      thumbnail: image ? `/api/v1/files/${image.thumbPath || image.path}` : null,
      thumbnailAlt: image?.altText || item.product.name,
      quantity: item.quantity,
      stockQuantity: item.product.stockQuantity,
      lineTotal: lineTotal(price, item.quantity),
    };
  });
  return {
    id: cart.id,
    guest: !cart.userId,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: cartSubtotal(items.map((item) => ({ unitPrice: item.price, quantity: item.quantity }))),
    warnings,
  };
}

async function loadWithItems(id: string) {
  return prisma.cart.findUniqueOrThrow({
    where: { id },
    include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
  });
}

async function findGuestCart(guestTokenRaw?: string) {
  if (!guestTokenRaw) return null;
  const cart = await prisma.cart.findUnique({
    where: { guestToken: sha256Hex(guestTokenRaw) },
    include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
  });
  if (!cart) return null;
  if (cart.expiresAt && cart.expiresAt.getTime() < Date.now()) {
    await prisma.cart.delete({ where: { id: cart.id } }).catch(() => undefined);
    return null;
  }
  return cart;
}

async function findUserCart(userId: string) {
  return prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
  });
}

async function createUserCart(userId: string) {
  return prisma.cart.create({
    data: { userId },
    include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
  });
}

async function createGuestCart() {
  const raw = randomToken();
  const cart = await prisma.cart.create({
    data: {
      // Cookie holds `raw`; the database only stores the hash.
      guestToken: sha256Hex(raw),
      expiresAt: new Date(Date.now() + GUEST_TTL_MS),
    },
    include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
  });
  return { cart, raw };
}

async function mergeGuestIntoUser(guest: CartRecord, userCart: CartRecord) {
  for (const guestItem of guest.items) {
    const stock = guestItem.product.stockQuantity;
    const existing = userCart.items.find((item) => item.productId === guestItem.productId);
    const desired = (existing?.quantity ?? 0) + guestItem.quantity;
    const quantity = clampQuantity(desired, stock);
    if (quantity <= 0) continue;
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          productId: guestItem.productId,
          quantity,
        },
      });
    }
  }
  await prisma.cart.delete({ where: { id: guest.id } });
}

async function heldStockForCart(cart: CartRecord) {
  const held = new Map<string, number>();
  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      ...(cart.userId ? { userId: cart.userId } : { userId: null }),
    },
    include: {
      reservations: { where: { releasedAt: null } },
      payment: { select: { metadataEnc: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  for (const order of orders) {
    if (!cart.userId) {
      let checkoutCartId: string | undefined;
      if (order.payment?.metadataEnc) {
        try {
          checkoutCartId = decryptJson<{ cartId?: string }>(order.payment.metadataEnc).cartId;
        } catch {
          checkoutCartId = undefined;
        }
      }
      if (checkoutCartId !== cart.id) continue;
    }
    for (const reservation of order.reservations) {
      held.set(reservation.productId, (held.get(reservation.productId) ?? 0) + reservation.quantity);
    }
  }
  return held;
}

async function syncStock(cart: CartRecord) {
  const warnings: { productId: string; message: string }[] = [];
  const held = await heldStockForCart(cart);
  for (const item of cart.items) {
    const available = item.product.stockQuantity + (held.get(item.productId) ?? 0);
    const next = clampQuantity(item.quantity, available);
    if (next === item.quantity) continue;
    if (next <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
      warnings.push({
        productId: item.productId,
        message: `${item.product.name} is out of stock and was removed from your cart.`,
      });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: next } });
      warnings.push({
        productId: item.productId,
        message: `Only ${next} of ${item.product.name} ${next === 1 ? "is" : "are"} available.`,
      });
    }
  }
  if (warnings.length === 0) return { cart, warnings };
  return { cart: await loadWithItems(cart.id), warnings };
}

async function resolveCart(ctx: CartContext): Promise<{ cart: CartRecord; cookie: CartCookieAction }> {
  const guest = await findGuestCart(ctx.guestTokenRaw);
  if (ctx.userId) {
    let userCart = await findUserCart(ctx.userId);
    if (!userCart) userCart = await createUserCart(ctx.userId);
    if (guest) {
      await mergeGuestIntoUser(guest, userCart);
      return { cart: await loadWithItems(userCart.id), cookie: { type: "clear" } };
    }
    return { cart: userCart, cookie: { type: "keep" } };
  }
  if (guest) {
    const refreshed = await prisma.cart.update({
      where: { id: guest.id },
      data: { expiresAt: new Date(Date.now() + GUEST_TTL_MS) },
      include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
    });
    return { cart: refreshed, cookie: { type: "keep" } };
  }
  const created = await createGuestCart();
  return { cart: created.cart, cookie: { type: "set", token: created.raw } };
}

export const cartService = {
  async get(ctx: CartContext, options: { skipStockSync?: boolean } = {}) {
    const resolved = await resolveCart(ctx);
    if (options.skipStockSync) {
      return { dto: toDto(resolved.cart), cookie: resolved.cookie };
    }
    const synced = await syncStock(resolved.cart);
    return { dto: toDto(synced.cart, synced.warnings), cookie: resolved.cookie };
  },

  async addItem(ctx: CartContext, input: unknown) {
    const dto = addCartItemSchema.parse(input);
    const resolved = await resolveCart(ctx);
    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new HttpError(404, "Product not found");
    if (product.stockQuantity <= 0) {
      throw new HttpError(409, "This item is currently out of stock.", {
        quantity: "This item is currently out of stock.",
      });
    }
    const existing = resolved.cart.items.find((item) => item.productId === dto.productId);
    const desired = (existing?.quantity ?? 0) + dto.quantity;
    if (desired > product.stockQuantity) {
      throw new HttpError(409, `Only ${product.stockQuantity} in stock.`, {
        quantity: `Only ${product.stockQuantity} available.`,
      });
    }
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: desired },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: resolved.cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }
    const cart = await loadWithItems(resolved.cart.id);
    return { dto: toDto(cart), cookie: resolved.cookie };
  },

  async updateItem(ctx: CartContext, itemId: string, input: unknown) {
    const dto = updateCartItemSchema.parse(input);
    const resolved = await resolveCart(ctx);
    const item = resolved.cart.items.find((row) => row.id === itemId);
    if (!item) throw new HttpError(404, "Cart item not found");
    if (dto.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else if (dto.quantity > item.product.stockQuantity) {
      throw new HttpError(409, `Only ${item.product.stockQuantity} in stock.`, {
        quantity: `Only ${item.product.stockQuantity} available.`,
      });
    } else {
      await prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });
    }
    const cart = await loadWithItems(resolved.cart.id);
    return { dto: toDto(cart), cookie: resolved.cookie };
  },

  async removeItem(ctx: CartContext, itemId: string) {
    return this.updateItem(ctx, itemId, { quantity: 0 });
  },

  async clear(ctx: CartContext) {
    const resolved = await resolveCart(ctx);
    await prisma.cartItem.deleteMany({ where: { cartId: resolved.cart.id } });
    const cart = await loadWithItems(resolved.cart.id);
    return { dto: toDto(cart), cookie: resolved.cookie };
  },

  async related(ctx: CartContext) {
    const resolved = await this.get(ctx);
    const ids = resolved.dto.items.map((item) => item.productId);
    if (ids.length === 0) {
      return { items: [], cookie: resolved.cookie };
    }
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { categoryId: true, brandId: true },
    });
    const items = await catalogService.recommend({
      excludeIds: ids,
      categoryIds: [...new Set(products.map((product) => product.categoryId))],
      brandIds: [...new Set(products.map((product) => product.brandId))],
      take: 4,
    });
    return { items, cookie: resolved.cookie };
  },
};
