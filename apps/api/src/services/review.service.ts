import { Prisma } from "@prisma/client";
import {
  averageRating,
  createReviewSchema,
  REVIEWABLE_ORDER_STATUSES,
  reviewListQuerySchema,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";


function displayName(user: { displayName: string | null; email: string }) {
  if (user.displayName?.trim()) return user.displayName.trim();
  const local = user.email.split("@")[0] ?? "Customer";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function productIdOf(idOrSlug: string) {
  const product = await prisma.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!product) throw new HttpError(404, "Product not found");
  return product.id;
}

async function purchasedOrder(userId: string, productId: string) {
  return prisma.order.findFirst({
    where: {
      userId,
      status: { in: [...REVIEWABLE_ORDER_STATUSES] },
      items: { some: { productId } },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
}

async function refreshProductRating(productId: string) {
  const published = await prisma.review.findMany({
    where: { productId, status: "PUBLISHED" },
    select: { stars: true },
  });
  const stats = averageRating(published.map((row) => row.stars));
  await prisma.product.update({
    where: { id: productId },
    data: { averageRating: stats.average, reviewCount: stats.count },
  });
  return stats;
}

function mapReview(
  review: {
    id: string;
    stars: number;
    title: string | null;
    body: string;
    helpfulCount: number;
    createdAt: Date;
    user: { displayName: string | null; email: string };
  },
  viewerId?: string,
  votedIds?: Set<string>,
) {
  return {
    id: review.id,
    stars: review.stars,
    title: review.title,
    body: review.body,
    helpfulCount: review.helpfulCount,
    createdAt: review.createdAt.toISOString(),
    author: displayName(review.user),
    voted: viewerId ? Boolean(votedIds?.has(review.id)) : false,
  };
}

export const reviewService = {
  async list(idOrSlug: string, rawQuery: unknown, viewerId?: string) {
    const productId = await productIdOf(idOrSlug);
    const query = reviewListQuerySchema.parse(rawQuery);
    const skip = (query.page - 1) * query.pageSize;
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === "newest"
        ? [{ createdAt: "desc" }]
        : [{ helpfulCount: "desc" }, { createdAt: "desc" }];
    const where = { productId, status: "PUBLISHED" as const };
    const [total, items] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        include: { user: { select: { displayName: true, email: true } } },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);
    let votedIds = new Set<string>();
    if (viewerId && items.length) {
      const votes = await prisma.reviewVote.findMany({
        where: { userId: viewerId, reviewId: { in: items.map((item) => item.id) } },
        select: { reviewId: true },
      });
      votedIds = new Set(votes.map((vote) => vote.reviewId));
    }
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      items: items.map((item) => mapReview(item, viewerId, votedIds)),
    };
  },

  async eligibility(idOrSlug: string, userId: string) {
    const productId = await productIdOf(idOrSlug);
    const order = await purchasedOrder(userId, productId);
    const existing = await prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
      select: { id: true, status: true },
    });
    return {
      purchased: Boolean(order),
      canReview: Boolean(order) && !existing,
      orderId: order?.id ?? null,
      existingReviewId: existing?.id ?? null,
    };
  },

  async pending(userId: string) {
    const reviewed = await prisma.review.findMany({
      where: { userId },
      select: { productId: true },
    });
    const reviewedIds = reviewed.map((row) => row.productId);
    const rows = await prisma.orderItem.findMany({
      where: {
        order: {
          userId,
          status: { in: [...REVIEWABLE_ORDER_STATUSES] },
        },
        ...(reviewedIds.length ? { productId: { notIn: reviewedIds } } : {}),
      },
      select: {
        productId: true,
        productName: true,
        orderId: true,
        thumbnailPath: true,
        product: { select: { slug: true, name: true } },
        order: { select: { createdAt: true } },
      },
      orderBy: { order: { createdAt: "desc" } },
    });
    const seen = new Set<string>();
    const items = [];
    for (const row of rows) {
      if (seen.has(row.productId)) continue;
      seen.add(row.productId);
      items.push({
        productId: row.productId,
        slug: row.product.slug,
        name: row.product.name || row.productName,
        orderId: row.orderId,
        thumbnail: row.thumbnailPath ? `/api/v1/files/${row.thumbnailPath}` : null,
      });
    }
    return { items };
  },

  async create(idOrSlug: string, userId: string, input: unknown) {
    const productId = await productIdOf(idOrSlug);
    const dto = createReviewSchema.parse(input);
    if (!(await purchasedOrder(userId, productId))) {
      throw new HttpError(403, "You can only review products from an order.");
    }
    const existing = await prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    if (existing) {
      throw new HttpError(409, "You have already reviewed this product.");
    }
    const review = await prisma.review.create({
      data: {
        productId,
        userId,
        stars: dto.stars,
        title: dto.title || null,
        body: dto.body,
      },
      include: { user: { select: { displayName: true, email: true } } },
    });
    const stats = await refreshProductRating(productId);
    return { review: mapReview(review, userId), product: stats };
  },

  async vote(reviewId: string, userId: string) {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review || review.status !== "PUBLISHED") {
      throw new HttpError(404, "Review not found");
    }
    const already = await prisma.reviewVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });
    if (already) {
      return { helpfulCount: review.helpfulCount, voted: true };
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.reviewVote.create({ data: { reviewId, userId } });
      return tx.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { increment: 1 } },
      });
    });
    return { helpfulCount: updated.helpfulCount, voted: true };
  },

  async moderate(reviewId: string, status: "PUBLISHED" | "HIDDEN") {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new HttpError(404, "Review not found");
    await prisma.review.update({ where: { id: reviewId }, data: { status } });
    await refreshProductRating(review.productId);
    return { id: reviewId, status };
  },

  async adminList(rawQuery: unknown) {
    const query = reviewListQuerySchema.parse(rawQuery);
    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await Promise.all([
      prisma.review.count(),
      prisma.review.findMany({
        include: {
          user: { select: { email: true, displayName: true } },
          product: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((item) => ({
        id: item.id,
        stars: item.stars,
        title: item.title,
        body: item.body,
        helpfulCount: item.helpfulCount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        author: displayName(item.user),
        email: item.user.email,
        product: item.product,
      })),
    };
  },

  refreshProductRating,
};
