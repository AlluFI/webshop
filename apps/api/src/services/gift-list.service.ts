import {
  MAX_GIFT_LISTS,
  createGiftListSchema,
  releaseGiftItemSchema,
  reserveGiftItemSchema,
  updateGiftListSchema,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { randomToken, sha256Hex } from "../lib/hash.js";
import { catalogService } from "./catalog.service.js";

function shareUrl(token: string) {
  return `${config.webAppUrl.replace(/\/$/, "")}/lists/${token}`;
}

async function requireList(userId: string, listId: string) {
  const list = await prisma.giftList.findFirst({
    where: { id: listId, userId },
    include: { items: { orderBy: { createdAt: "desc" } } },
  });
  if (!list) throw new HttpError(404, "Gift list not found");
  return list;
}

async function hydrate(items: { productId: string; reservedAt: Date | null }[]) {
  const out = [];
  for (const item of items) {
    try {
      const product = await catalogService.byIdOrSlug(item.productId);
      out.push({
        productId: item.productId,
        reserved: Boolean(item.reservedAt),
        product,
      });
    } catch {
      // product removed
    }
  }
  return out;
}

async function present(
  list: {
    id: string;
    title: string;
    occasion: string;
    shareToken: string;
    createdAt: Date;
    updatedAt: Date;
    items: { productId: string; reservedAt: Date | null }[];
  },
  ownerName: string,
) {
  return {
    id: list.id,
    title: list.title,
    occasion: list.occasion,
    shareToken: list.shareToken,
    shareUrl: shareUrl(list.shareToken),
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    ownerName,
    items: await hydrate(list.items),
  };
}

async function ownerNameFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  const name = user?.displayName?.trim();
  return name || "A Volt shopper";
}

export const giftListService = {
  async listMine(userId: string) {
    const rows = await prisma.giftList.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { createdAt: "desc" } } },
    });
    const ownerName = await ownerNameFor(userId);
    const items = [];
    for (const row of rows) items.push(await present(row, ownerName));
    return { items };
  },

  async create(userId: string, input: unknown) {
    const dto = createGiftListSchema.parse(input);
    const count = await prisma.giftList.count({ where: { userId } });
    if (count >= MAX_GIFT_LISTS) {
      throw new HttpError(409, `You can keep up to ${MAX_GIFT_LISTS} gift lists.`);
    }
    const wishlist = await prisma.wishlistItem.findMany({
      where: { userId },
      select: { productId: true },
      orderBy: { createdAt: "desc" },
    });
    if (!wishlist.length) {
      throw new HttpError(400, "Save products to your wishlist first.");
    }
    const created = await prisma.giftList.create({
      data: {
        userId,
        title: dto.title,
        occasion: dto.occasion,
        shareToken: randomToken(16),
        items: { create: wishlist.map((row) => ({ productId: row.productId })) },
      },
      include: { items: { orderBy: { createdAt: "desc" } } },
    });
    return present(created, await ownerNameFor(userId));
  },

  async update(userId: string, listId: string, input: unknown) {
    const dto = updateGiftListSchema.parse(input);
    const list = await requireList(userId, listId);
    if (dto.refreshFromWishlist) {
      const wishlist = await prisma.wishlistItem.findMany({
        where: { userId },
        select: { productId: true },
      });
      const wanted = new Set(wishlist.map((row) => row.productId));
      const existing = new Map(list.items.map((item) => [item.productId, item]));
      await prisma.$transaction(async (tx) => {
        for (const productId of wanted) {
          if (!existing.has(productId)) {
            await tx.giftListItem.create({ data: { giftListId: list.id, productId } });
          }
        }
        for (const item of list.items) {
          if (!wanted.has(item.productId) && !item.reservedAt) {
            await tx.giftListItem.delete({ where: { id: item.id } });
          }
        }
        await tx.giftList.update({
          where: { id: list.id },
          data: {
            title: dto.title ?? list.title,
            occasion: dto.occasion ?? list.occasion,
          },
        });
      });
    } else if (dto.title || dto.occasion) {
      await prisma.giftList.update({
        where: { id: list.id },
        data: {
          title: dto.title ?? list.title,
          occasion: dto.occasion ?? list.occasion,
        },
      });
    }
    const fresh = await requireList(userId, listId);
    return present(fresh, await ownerNameFor(userId));
  },

  async rotate(userId: string, listId: string) {
    const list = await requireList(userId, listId);
    const updated = await prisma.giftList.update({
      where: { id: list.id },
      data: { shareToken: randomToken(16) },
      include: { items: { orderBy: { createdAt: "desc" } } },
    });
    return present(updated, await ownerNameFor(userId));
  },

  async remove(userId: string, listId: string) {
    const list = await requireList(userId, listId);
    await prisma.giftList.delete({ where: { id: list.id } });
    return this.listMine(userId);
  },

  async ownerRelease(userId: string, listId: string, productId: string) {
    const list = await requireList(userId, listId);
    await prisma.giftListItem.updateMany({
      where: { giftListId: list.id, productId },
      data: { reservedAt: null, claimTokenHash: null },
    });
    const fresh = await requireList(userId, listId);
    return present(fresh, await ownerNameFor(userId));
  },

  async publicByToken(token: string) {
    const list = await prisma.giftList.findUnique({
      where: { shareToken: token },
      include: {
        user: { select: { displayName: true, deletedAt: true } },
        items: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!list || list.user.deletedAt) throw new HttpError(404, "Gift list not found");
    const ownerName = list.user.displayName?.trim() || "A Volt shopper";
    return {
      title: list.title,
      occasion: list.occasion,
      ownerName,
      items: await hydrate(list.items),
    };
  },

  async reserve(token: string, productId: string, input: unknown) {
    const dto = reserveGiftItemSchema.parse(input);
    const list = await prisma.giftList.findUnique({
      where: { shareToken: token },
      include: { user: { select: { deletedAt: true } } },
    });
    if (!list || list.user.deletedAt) throw new HttpError(404, "Gift list not found");
    const item = await prisma.giftListItem.findUnique({
      where: { giftListId_productId: { giftListId: list.id, productId } },
    });
    if (!item) throw new HttpError(404, "That product is not on this list");

    if (item.reservedAt && item.claimTokenHash) {
      if (dto.claimToken && sha256Hex(dto.claimToken) === item.claimTokenHash) {
        return { reserved: true, claimToken: dto.claimToken, already: true };
      }
      throw new HttpError(409, "Someone already reserved this gift.");
    }

    const claimToken = dto.claimToken || randomToken(16);
    const claimed = await prisma.giftListItem.updateMany({
      where: { id: item.id, reservedAt: null },
      data: { reservedAt: new Date(), claimTokenHash: sha256Hex(claimToken) },
    });
    if (claimed.count === 0) {
      throw new HttpError(409, "Someone already reserved this gift.");
    }
    return { reserved: true, claimToken, already: false };
  },

  async release(token: string, productId: string, input: unknown) {
    const dto = releaseGiftItemSchema.parse(input);
    const list = await prisma.giftList.findUnique({
      where: { shareToken: token },
    });
    if (!list) throw new HttpError(404, "Gift list not found");
    const released = await prisma.giftListItem.updateMany({
      where: {
        giftListId: list.id,
        productId,
        claimTokenHash: sha256Hex(dto.claimToken),
      },
      data: { reservedAt: null, claimTokenHash: null },
    });
    if (released.count === 0) {
      throw new HttpError(403, "Only the person who reserved this can undo it.");
    }
    return { reserved: false };
  },
};
