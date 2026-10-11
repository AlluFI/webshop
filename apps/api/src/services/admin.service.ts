import { Prisma, type OrderStatus } from "@prisma/client";
import {
  adminAuditQuerySchema,
  adminCategorySchema,
  adminOrderStatusSchema,
  adminProductSchema,
  adminUserListQuerySchema,
  adminUserRoleSchema,
  AUDIT_ENTITIES,
  formatRefundNote,
  isStaffRole,
  orderListQuerySchema,
  slugify,
  staffRefundRequestSchema,
  storeCalendarDate,
  storeDayEnd,
  storeDayStart,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { diffRecords, parseAuditMeta, writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { decrypt } from "../lib/crypto.js";
import { writeDerivedImages, writePlaceholderImage } from "../lib/images.js";
import { bumpFacetCache, catalogService } from "./catalog.service.js";
import { sendOrderShippedMail } from "./order-fulfillment.js";
import { orderService } from "./order.service.js";
import { reviewService } from "./review.service.js";
import { shippingService } from "./shipping.service.js";

function kgToLb(kg: number) {
  return Number((kg * 2.20462).toFixed(3));
}

function cmToIn(cm: number) {
  return Number((cm / 2.54).toFixed(2));
}

function productAuditFields(input: {
  name: string;
  slug: string;
  description: string;
  price: number;
  stockQuantity: number;
  category: string;
  brand: string;
  featured: boolean;
}) {
  return {
    name: input.name,
    slug: input.slug,
    price: input.price,
    stock: input.stockQuantity,
    category: input.category,
    brand: input.brand,
    featured: input.featured,
    description: input.description,
  };
}

async function ensureCategory(nameOrSlug: string) {
  const slug = slugify(nameOrSlug) || "category";
  const existing = await prisma.category.findFirst({
    where: { OR: [{ slug }, { name: { equals: nameOrSlug, mode: "insensitive" } }] },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { name: nameOrSlug, slug },
  });
}

async function ensureBrand(nameOrSlug: string) {
  const slug = slugify(nameOrSlug) || "brand";
  const existing = await prisma.brand.findFirst({
    where: { OR: [{ slug }, { name: { equals: nameOrSlug, mode: "insensitive" } }] },
  });
  if (existing) return existing;
  return prisma.brand.create({ data: { name: nameOrSlug, slug } });
}

function dimensions(dto: {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightLb?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
}) {
  return {
    weightKg: dto.weightKg,
    weightLb: dto.weightLb ?? kgToLb(dto.weightKg),
    lengthCm: dto.lengthCm,
    widthCm: dto.widthCm,
    heightCm: dto.heightCm,
    lengthIn: dto.lengthIn ?? cmToIn(dto.lengthCm),
    widthIn: dto.widthIn ?? cmToIn(dto.widthCm),
    heightIn: dto.heightIn ?? cmToIn(dto.heightCm),
  };
}

export const adminService = {
  async createProduct(actorId: string, input: unknown) {
    const dto = adminProductSchema.parse(input);
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new HttpError(400, "A product slug is required");
    const clash = await prisma.product.findUnique({ where: { slug } });
    if (clash) throw new HttpError(409, "A product with that slug already exists");
    const [category, brand] = await Promise.all([
      ensureCategory(dto.category),
      ensureBrand(dto.brand),
    ]);
    const product = await prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        stockQuantity: dto.stockQuantity,
        categoryId: category.id,
        brandId: brand.id,
        featured: Boolean(dto.featured),
        ...dimensions(dto),
        attributes: dto.attributes?.length
          ? { create: dto.attributes }
          : undefined,
      },
    });
    const imageName = await writePlaceholderImage(config.uploadDir, slug, dto.name);
    const derived = await writeDerivedImages(config.uploadDir, imageName);
    await prisma.productImage.create({
      data: {
        productId: product.id,
        path: derived.full,
        thumbPath: derived.thumb,
        altText: `${dto.name} product photo`,
        sortOrder: 0,
      },
    });
    await writeAudit({
      actorId,
      action: "product.create",
      entity: "product",
      entityId: product.id,
      meta: {
        target: product.name,
        changes: [{ field: "record", from: "—", to: product.name }],
      },
    });
    await bumpFacetCache();
    return catalogService.byIdOrSlug(product.id);
  },

  async updateProduct(actorId: string, id: string, input: unknown) {
    const dto = adminProductSchema.parse(input);
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { category: { select: { slug: true } }, brand: { select: { slug: true } } },
    });
    if (!existing) throw new HttpError(404, "Product not found");
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new HttpError(400, "A product slug is required");
    if (slug !== existing.slug) {
      const clash = await prisma.product.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "A product with that slug already exists");
    }
    const [category, brand] = await Promise.all([
      ensureCategory(dto.category),
      ensureBrand(dto.brand),
    ]);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          price: dto.price,
          stockQuantity: dto.stockQuantity,
          categoryId: category.id,
          brandId: brand.id,
          featured: Boolean(dto.featured),
          ...dimensions(dto),
        },
      });
      if (dto.attributes) {
        await tx.productAttribute.deleteMany({ where: { productId: id } });
        if (dto.attributes.length) {
          await tx.productAttribute.createMany({
            data: dto.attributes.map((attribute) => ({
              productId: id,
              name: attribute.name,
              value: attribute.value,
            })),
          });
        }
      }
    });
    const changes = diffRecords(
      productAuditFields({
        name: existing.name,
        slug: existing.slug,
        description: existing.description,
        price: Number(existing.price),
        stockQuantity: existing.stockQuantity,
        category: existing.category.slug,
        brand: existing.brand.slug,
        featured: existing.featured,
      }),
      productAuditFields({
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        stockQuantity: dto.stockQuantity,
        category: category.slug,
        brand: brand.slug,
        featured: Boolean(dto.featured),
      }),
    );
    if (changes.length) {
      await writeAudit({
        actorId,
        action: "product.update",
        entity: "product",
        entityId: id,
        meta: { target: dto.name, changes },
      });
    }
    await bumpFacetCache();
    return catalogService.byIdOrSlug(id);
  },

  async deleteProduct(actorId: string, id: string) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Product not found");
    await prisma.product.delete({ where: { id } });
    await writeAudit({
      actorId,
      action: "product.delete",
      entity: "product",
      entityId: id,
      meta: {
        target: existing.name,
        changes: [{ field: "record", from: existing.name, to: "deleted" }],
      },
    });
    await bumpFacetCache();
    return { deleted: true };
  },

  async attachImage(
    actorId: string,
    productId: string,
    image: { path: string; thumbPath: string; altText: string },
  ) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found");
    const count = await prisma.productImage.count({ where: { productId } });
    await prisma.productImage.create({
      data: {
        productId,
        path: image.path,
        thumbPath: image.thumbPath,
        altText: image.altText || `${product.name} product photo`,
        sortOrder: count,
      },
    });
    await writeAudit({
      actorId,
      action: "product.image",
      entity: "product",
      entityId: productId,
      meta: {
        target: product.name,
        changes: [{ field: "image", from: "—", to: "added" }],
      },
    });
    return catalogService.byIdOrSlug(productId);
  },

  async createCategory(actorId: string, input: unknown) {
    const dto = adminCategorySchema.parse(input);
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new HttpError(400, "A category slug is required");
    const clash = await prisma.category.findUnique({ where: { slug } });
    if (clash) throw new HttpError(409, "That category already exists");
    const row = await prisma.category.create({
      data: { name: dto.name, slug, description: dto.description || null },
    });
    await writeAudit({
      actorId,
      action: "category.create",
      entity: "category",
      entityId: row.id,
      meta: {
        target: row.name,
        changes: [{ field: "record", from: "—", to: row.name }],
      },
    });
    await bumpFacetCache();
    return row;
  },

  async updateCategory(actorId: string, id: string, input: unknown) {
    const dto = adminCategorySchema.parse(input);
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Category not found");
    const slug = slugify(dto.slug || dto.name);
    const row = await prisma.category.update({
      where: { id },
      data: { name: dto.name, slug, description: dto.description || null },
    });
    const changes = diffRecords(
      {
        name: existing.name,
        slug: existing.slug,
        description: existing.description ?? "",
      },
      {
        name: row.name,
        slug: row.slug,
        description: row.description ?? "",
      },
    );
    if (changes.length) {
      await writeAudit({
        actorId,
        action: "category.update",
        entity: "category",
        entityId: id,
        meta: { target: row.name, changes },
      });
    }
    await bumpFacetCache();
    return row;
  },

  async deleteCategory(actorId: string, id: string) {
    const existing = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!existing) throw new HttpError(404, "Category not found");
    if (existing._count.products > 0) {
      throw new HttpError(409, "Move or delete products in this category first");
    }
    if (existing._count.children > 0) {
      throw new HttpError(409, "Remove child categories first");
    }
    await prisma.category.delete({ where: { id } });
    await writeAudit({
      actorId,
      action: "category.delete",
      entity: "category",
      entityId: id,
      meta: {
        target: existing.name,
        changes: [{ field: "record", from: existing.name, to: "deleted" }],
      },
    });
    await bumpFacetCache();
    return { deleted: true };
  },

  async listUsers(rawQuery: unknown) {
    const query = adminUserListQuerySchema.parse(rawQuery);
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = { name: query.role };
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: "insensitive" } },
        { displayName: { contains: query.q, mode: "insensitive" } },
      ];
    }
    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role.name,
        totpEnabled: user.totpEnabled,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
    };
  },

  async assignRole(actorId: string, userId: string, input: unknown) {
    const { role } = adminUserRoleSchema.parse(input);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new HttpError(404, "User not found");
    if (isStaffRole(role) && !user.totpEnabled) {
      throw new HttpError(
        409,
        "Staff roles require two-factor authentication. The user must enable 2FA first.",
      );
    }
    const roleRow = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRow) throw new HttpError(400, "Unknown role");
    await prisma.user.update({ where: { id: userId }, data: { roleId: roleRow.id } });
    await writeAudit({
      actorId,
      action: "user.role",
      entity: "user",
      entityId: userId,
      meta: {
        target: user.email,
        changes: [{ field: "role", from: user.role.name, to: role }],
      },
    });
    return { id: userId, role };
  },

  async listOrders(rawQuery: unknown) {
    const query = orderListQuerySchema.parse(rawQuery);
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = storeDayStart(query.from);
      if (query.to) where.createdAt.lte = storeDayEnd(query.to);
    }
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          payment: { select: { status: true } },
          items: { select: { quantity: true, productName: true } },
          user: { select: { email: true } },
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
      items: rows.map((order) => {
        let email = order.user?.email ?? "";
        if (!email) {
          try {
            email = decrypt(order.contactEmailEnc);
          } catch {
            email = "";
          }
        }
        return {
          id: order.id,
          status: order.status,
          paymentStatus: order.payment?.status ?? "REQUIRES_PAYMENT",
          total: Number(order.total),
          currency: order.currency,
          createdAt: order.createdAt.toISOString(),
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          summary: order.items.map((item) => item.productName).join(", "),
          email: order.user?.email || email,
          shippingMethod: order.shippingMethod,
          trackingCarrier: order.trackingCarrier,
          trackingCode: order.trackingCode,
          estimatedDeliveryFrom: order.estimatedDeliveryFrom
            ? storeCalendarDate(order.estimatedDeliveryFrom)
            : null,
          estimatedDeliveryTo: order.estimatedDeliveryTo
            ? storeCalendarDate(order.estimatedDeliveryTo)
            : null,
        };
      }),
    };
  },

  async getOrder(id: string) {
    return orderService.adminGet(id);
  },

  async setOrderStatus(actorId: string, orderId: string, input: unknown) {
    const dto = adminOrderStatusSchema.parse(input);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");

    const becomingShipped = dto.status === "SHIPPED" && order.status !== "SHIPPED";
    const carrier = dto.carrier || order.trackingCarrier;
    const trackingCode = dto.trackingCode || order.trackingCode;
    if (dto.status === "SHIPPED" && (!carrier || !trackingCode)) {
      throw new HttpError(400, "Carrier and tracking code are required when shipping an order.");
    }

    let estimatedFrom = order.estimatedDeliveryFrom;
    let estimatedTo = order.estimatedDeliveryTo;
    if (dto.estimatedDeliveryFrom && dto.estimatedDeliveryTo) {
      estimatedFrom = storeDayStart(dto.estimatedDeliveryFrom);
      estimatedTo = storeDayEnd(dto.estimatedDeliveryTo);
    } else if (becomingShipped && (!estimatedFrom || !estimatedTo)) {
      const options = await shippingService.list(true);
      const option = options.find((row) => row.code === order.shippingMethod);
      if (option) {
        const window = shippingService.estimate(option, new Date());
        estimatedFrom = storeDayStart(window.from);
        estimatedTo = storeDayEnd(window.to);
      }
    }

    const note =
      dto.note ||
      (dto.status === "SHIPPED" && trackingCode
        ? `Shipped with ${carrier} ${trackingCode}`
        : "Updated by staff");

    const nextCarrier = dto.status === "SHIPPED" ? carrier : order.trackingCarrier;
    const nextTracking = dto.status === "SHIPPED" ? trackingCode : order.trackingCode;
    const changes = diffRecords(
      {
        status: order.status,
        carrier: order.trackingCarrier ?? "",
        trackingCode: order.trackingCode ?? "",
        deliveryFrom: order.estimatedDeliveryFrom ? storeCalendarDate(order.estimatedDeliveryFrom) : "",
        deliveryTo: order.estimatedDeliveryTo ? storeCalendarDate(order.estimatedDeliveryTo) : "",
      },
      {
        status: dto.status,
        carrier: nextCarrier ?? "",
        trackingCode: nextTracking ?? "",
        deliveryFrom: estimatedFrom ? storeCalendarDate(estimatedFrom) : "",
        deliveryTo: estimatedTo ? storeCalendarDate(estimatedTo) : "",
      },
    );

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: dto.status as OrderStatus,
          trackingCarrier: nextCarrier,
          trackingCode: nextTracking,
          shippedAt: becomingShipped ? new Date() : order.shippedAt,
          estimatedDeliveryFrom: estimatedFrom,
          estimatedDeliveryTo: estimatedTo,
        },
      }),
      prisma.orderStatusEvent.create({
        data: {
          orderId,
          status: dto.status as OrderStatus,
          note,
        },
      }),
    ]);
    await writeAudit({
      actorId,
      action: "order.status",
      entity: "order",
      entityId: orderId,
      meta: {
        target: orderId.slice(0, 8),
        changes: changes.length
          ? changes
          : [{ field: "status", from: order.status, to: dto.status }],
      },
    });
    if (becomingShipped) {
      await sendOrderShippedMail(orderId);
    }
    return orderService.adminGet(orderId);
  },

  async refund(actorId: string, orderId: string, input: unknown) {
    const dto = staffRefundRequestSchema.parse(input);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const result = await orderService.adminRefund(orderId, dto);
    await writeAudit({
      actorId,
      action: "order.refund",
      entity: "order",
      entityId: orderId,
      meta: {
        target: orderId.slice(0, 8),
        changes: [
          { field: "status", from: order?.status ?? "—", to: "REFUNDED" },
          { field: "reason", from: "—", to: formatRefundNote(dto.reason, dto.note, "staff") },
        ],
      },
    });
    return result;
  },

  async bulkProducts(actorId: string, rows: unknown[]) {
    const created: string[] = [];
    const errors: { row: number; error: string }[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const product = await this.createProduct(actorId, row);
        created.push(product.slug);
      } catch (err) {
        errors.push({
          row: index + 1,
          error: err instanceof HttpError ? err.message : "Invalid row",
        });
      }
    }
    await writeAudit({
      actorId,
      action: "product.bulk",
      entity: "product",
      meta: {
        target: "bulk upload",
        changes: [{ field: "created", from: "—", to: String(created.length) }],
      },
    });
    return { created: created.length, slugs: created, errors };
  },

  async listAudit(rawQuery: unknown) {
    const query = adminAuditQuerySchema.parse(rawQuery);
    const where = {
      entity: query.entity ?? { in: [...AUDIT_ENTITIES] },
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((item) => {
        const meta = parseAuditMeta(item.metaEnc);
        return {
          id: item.id,
          action: item.action,
          entity: item.entity,
          entityId: item.entityId,
          target: meta.target || item.entityId?.slice(0, 8) || "",
          actor: item.actor?.email ?? "system",
          actorName: item.actor?.displayName || item.actor?.email || "system",
          createdAt: item.createdAt.toISOString(),
          changes: meta.changes,
        };
      }),
    };
  },

  async moderateReview(actorId: string, reviewId: string, status: "PUBLISHED" | "HIDDEN") {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { product: { select: { name: true } } },
    });
    if (!review) throw new HttpError(404, "Review not found");
    const result = await reviewService.moderate(reviewId, status);
    await writeAudit({
      actorId,
      action: "review.moderate",
      entity: "review",
      entityId: reviewId,
      meta: {
        target: review.product.name,
        changes: [{ field: "status", from: review.status, to: status }],
      },
    });
    return result;
  },

  async updateShipping(actorId: string, id: string, input: unknown) {
    const existing = await prisma.shippingOption.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Shipping option not found");
    const row = await shippingService.update(id, input);
    const changes = diffRecords(
      {
        name: existing.name,
        description: existing.description ?? "",
        price: Number(existing.price),
        freeThreshold: existing.freeThreshold == null ? null : Number(existing.freeThreshold),
        minDays: existing.minDays,
        maxDays: existing.maxDays,
        active: existing.active,
      },
      {
        name: row.name,
        description: row.description ?? "",
        price: row.price,
        freeThreshold: row.freeThreshold,
        minDays: row.minDays,
        maxDays: row.maxDays,
        active: row.active,
      },
    );
    if (changes.length) {
      await writeAudit({
        actorId,
        action: "shipping.update",
        entity: "shipping",
        entityId: id,
        meta: { target: row.name, changes },
      });
    }
    return row;
  },
};
