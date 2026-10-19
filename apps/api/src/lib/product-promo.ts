import type { Prisma } from "@prisma/client";
import { addStoreDays, isOnPromotion, roundMoney, sellingPriceOf } from "@volt/shared";
import { prisma } from "../prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

export type PromoInput = {
  promoPrice: number | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
};

export function mapPromotion(row: {
  id: string;
  regularPrice: Prisma.Decimal | number;
  promoPrice: Prisma.Decimal | number;
  startsAt: Date;
  endsAt: Date;
  lowestPriceBeforePromo: Prisma.Decimal | number;
}) {
  return {
    id: row.id,
    regularPrice: Number(row.regularPrice),
    promoPrice: Number(row.promoPrice),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    lowestPriceBeforePromo: Number(row.lowestPriceBeforePromo),
  };
}

export async function lowestPriceBefore(db: Db, productId: string, before: Date) {
  const from = addStoreDays(before, -30);
  const rows = await db.productPriceHistory.findMany({
    where: { productId, recordedAt: { gte: from, lt: before } },
    select: { price: true },
  });
  if (!rows.length) return null;
  return roundMoney(Math.min(...rows.map((row) => Number(row.price))));
}

export async function recordSellingPrice(db: Db, productId: string, price: number, at = new Date()) {
  await db.productPriceHistory.create({
    data: { productId, price: roundMoney(price), recordedAt: at },
  });
}

export async function listPromotions(productId: string) {
  const rows = await prisma.productPromotion.findMany({
    where: { productId },
    orderBy: { startsAt: "desc" },
  });
  return { items: rows.map(mapPromotion) };
}

export async function syncProductPromo(
  db: Db,
  productId: string,
  regularPrice: number,
  promo: PromoInput,
  previous?: PromoInput & { regularPrice: number },
) {
  const nextOn = Boolean(promo.promoPrice && promo.promoStartsAt && promo.promoEndsAt);
  let lowest: number | null = null;
  if (nextOn && promo.promoPrice && promo.promoStartsAt && promo.promoEndsAt) {
    const sameWindow =
      previous?.promoStartsAt &&
      previous.promoStartsAt.getTime() === promo.promoStartsAt.getTime() &&
      previous.promoPrice != null;
    if (sameWindow) {
      const current = await db.product.findUnique({
        where: { id: productId },
        select: { lowestPriceBeforePromo: true },
      });
      lowest = current?.lowestPriceBeforePromo == null ? regularPrice : Number(current.lowestPriceBeforePromo);
    } else {
      lowest = (await lowestPriceBefore(db, productId, promo.promoStartsAt)) ?? regularPrice;
    }
    await db.product.update({
      where: { id: productId },
      data: {
        promoPrice: promo.promoPrice,
        promoStartsAt: promo.promoStartsAt,
        promoEndsAt: promo.promoEndsAt,
        lowestPriceBeforePromo: lowest,
      },
    });
    const existing = sameWindow
      ? await db.productPromotion.findFirst({
          where: { productId, startsAt: promo.promoStartsAt },
        })
      : null;
    const period = {
      regularPrice,
      promoPrice: promo.promoPrice,
      startsAt: promo.promoStartsAt,
      endsAt: promo.promoEndsAt,
      lowestPriceBeforePromo: lowest,
    };
    if (existing) await db.productPromotion.update({ where: { id: existing.id }, data: period });
    else await db.productPromotion.create({ data: { productId, ...period } });
  } else {
    await db.product.update({
      where: { id: productId },
      data: {
        promoPrice: null,
        promoStartsAt: null,
        promoEndsAt: null,
        lowestPriceBeforePromo: null,
      },
    });
  }

  const previousSelling = previous
    ? sellingPriceOf(previous.regularPrice, previous.promoPrice, previous.promoStartsAt, previous.promoEndsAt)
    : null;
  const nextSelling = sellingPriceOf(regularPrice, promo.promoPrice, promo.promoStartsAt, promo.promoEndsAt);
  if (previousSelling == null || previousSelling !== nextSelling) {
    await recordSellingPrice(db, productId, nextSelling);
  }
}

export function promoPublicFields(product: {
  price: Prisma.Decimal | number;
  promoPrice?: Prisma.Decimal | number | null;
  promoStartsAt?: Date | null;
  promoEndsAt?: Date | null;
  lowestPriceBeforePromo?: Prisma.Decimal | number | null;
}) {
  const regularPrice = Number(product.price);
  const promoPrice = product.promoPrice == null ? null : Number(product.promoPrice);
  const onPromotion = isOnPromotion(regularPrice, promoPrice, product.promoStartsAt, product.promoEndsAt);
  if (!onPromotion) {
    return {
      price: regularPrice,
      sellingPrice: regularPrice,
      onPromotion: false,
      promoPrice: null,
      promoStartsAt: null,
      promoEndsAt: null,
      lowestPrice30d: null,
    };
  }
  return {
    price: regularPrice,
    sellingPrice: sellingPriceOf(regularPrice, promoPrice, product.promoStartsAt, product.promoEndsAt),
    onPromotion: true,
    promoPrice,
    promoStartsAt: product.promoStartsAt?.toISOString() ?? null,
    promoEndsAt: product.promoEndsAt?.toISOString() ?? null,
    lowestPrice30d:
      product.lowestPriceBeforePromo == null ? regularPrice : Number(product.lowestPriceBeforePromo),
  };
}
