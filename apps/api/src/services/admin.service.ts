import { Prisma, type OrderStatus } from "@prisma/client";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import {
  adminAuditQuerySchema,
  adminCategorySchema,
  adminCreateEmployeeSchema,
  adminOrderStatusSchema,
  adminProductSchema,
  adminUserListQuerySchema,
  adminUserRoleSchema,
  adminWholesalerSchema,
  receiveStockSchema,
  restockOrderSchema,
  AUDIT_ENTITIES,
  ean13FromIndex,
  formatLocatorCode,
  formatOrderReference,
  formatRefundNote,
  isStaffRole,
  LOW_STOCK_THRESHOLD,
  orderListQuerySchema,
  pickOrderSchema,
  FINLAND_VAT_RATE,
  productPricing,
  slugify,
  staffRefundRequestSchema,
  STAFF_ROLES,
  storeCalendarDate,
  storeDayEnd,
  storeDayStart,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { diffRecords, parseAuditMeta, writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { hashPassword, randomToken, sha256Hex } from "../lib/hash.js";
import { writeDerivedImages, writePlaceholderImage } from "../lib/images.js";
import { bumpFacetCache, catalogService } from "./catalog.service.js";
import { mail } from "../mail.js";
import { VOLT_WAREHOUSE } from "../lib/restock-email.js";
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

function locatorOf(input: {
  locatorStation: number;
  locatorBlock: number;
  locatorShelf: number;
  locatorPlace: number;
}) {
  return {
    locatorStation: input.locatorStation,
    locatorBlock: input.locatorBlock,
    locatorShelf: input.locatorShelf,
    locatorPlace: input.locatorPlace,
  };
}

function productAuditFields(input: {
  name: string;
  slug: string;
  description: string;
  price: number;
  wholesalePrice?: number | null;
  vatRate?: number | null;
  stockQuantity: number;
  category: string;
  brand: string;
  featured: boolean;
  locatorStation: number;
  locatorBlock: number;
  locatorShelf: number;
  locatorPlace: number;
  wholesaler?: string | null;
  wholesaleSku?: string | null;
  barcode?: string | null;
}) {
  return {
    name: input.name,
    slug: input.slug,
    price: input.price,
    wholesalePrice: input.wholesalePrice ?? "—",
    vatRate: input.vatRate ?? FINLAND_VAT_RATE,
    stock: input.stockQuantity,
    category: input.category,
    brand: input.brand,
    featured: input.featured,
    description: input.description,
    locator: formatLocatorCode(
      input.locatorStation,
      input.locatorBlock,
      input.locatorShelf,
      input.locatorPlace,
    ),
    wholesaler: input.wholesaler || "—",
    sku: input.wholesaleSku || "—",
    barcode: input.barcode || "—",
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

async function ensureUniqueBarcode(preferred: string | null, excludeId?: string) {
  if (preferred) {
    const clash = await prisma.product.findFirst({
      where: { barcode: preferred, NOT: excludeId ? { id: excludeId } : undefined },
    });
    if (clash) throw new HttpError(409, "That barcode is already on another product");
    return preferred;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const generated = ean13FromIndex(Date.now() % 1_000_000 + attempt);
    const clash = await prisma.product.findFirst({ where: { barcode: generated } });
    if (!clash) return generated;
  }
  throw new HttpError(500, "Could not allocate a barcode");
}

async function resolveWholesaler(id: string | null) {
  if (!id) return null;
  const row = await prisma.wholesaler.findUnique({ where: { id } });
  if (!row) throw new HttpError(400, "Wholesaler not found");
  return row;
}

function blankToNull(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function mapWholesaler(row: {
  id: string;
  name: string;
  slug: string;
  email: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  products?: { id: string; name: string; slug: string; stockQuantity: number; wholesaleSku: string | null }[];
  purchaseOrders?: {
    id: string;
    reference: string;
    note: string | null;
    createdAt: Date;
    items: { productName: string; quantity: number }[];
  }[];
  _count?: { products: number };
}) {
  const products = row.products ?? [];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    email: row.email,
    contactName: row.contactName,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    productCount: row._count?.products ?? products.length,
    lowStockCount: products.filter((product) => product.stockQuantity < LOW_STOCK_THRESHOLD).length,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      stockQuantity: product.stockQuantity,
      wholesaleSku: product.wholesaleSku,
    })),
    purchaseOrders: (row.purchaseOrders ?? []).map((order) => ({
      id: order.id,
      reference: order.reference,
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      summary: order.items.map((item) => `${item.productName} × ${item.quantity}`).join(", "),
    })),
  };
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
    const [category, brand, wholesaler, barcode] = await Promise.all([
      ensureCategory(dto.category),
      ensureBrand(dto.brand),
      resolveWholesaler(dto.wholesalerId),
      ensureUniqueBarcode(dto.barcode),
    ]);
    const product = await prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        wholesalePrice: dto.wholesalePrice,
        vatRate: dto.vatRate,
        stockQuantity: dto.stockQuantity,
        categoryId: category.id,
        brandId: brand.id,
        featured: Boolean(dto.featured),
        wholesalerId: wholesaler?.id ?? null,
        wholesaleSku: dto.wholesaleSku,
        barcode,
        ...dimensions(dto),
        ...locatorOf(dto),
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
      include: {
        category: { select: { slug: true } },
        brand: { select: { slug: true } },
        wholesaler: { select: { name: true } },
      },
    });
    if (!existing) throw new HttpError(404, "Product not found");
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new HttpError(400, "A product slug is required");
    if (slug !== existing.slug) {
      const clash = await prisma.product.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "A product with that slug already exists");
    }
    const [category, brand, wholesaler, barcode] = await Promise.all([
      ensureCategory(dto.category),
      ensureBrand(dto.brand),
      resolveWholesaler(dto.wholesalerId),
      ensureUniqueBarcode(dto.barcode ?? existing.barcode, id),
    ]);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          price: dto.price,
          wholesalePrice: dto.wholesalePrice,
          vatRate: dto.vatRate,
          stockQuantity: dto.stockQuantity,
          categoryId: category.id,
          brandId: brand.id,
          featured: Boolean(dto.featured),
          wholesalerId: wholesaler?.id ?? null,
          wholesaleSku: dto.wholesaleSku,
          barcode,
          ...dimensions(dto),
          ...locatorOf(dto),
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
        wholesalePrice: existing.wholesalePrice == null ? null : Number(existing.wholesalePrice),
        vatRate: Number(existing.vatRate),
        stockQuantity: existing.stockQuantity,
        category: existing.category.slug,
        brand: existing.brand.slug,
        featured: existing.featured,
        locatorStation: existing.locatorStation,
        locatorBlock: existing.locatorBlock,
        locatorShelf: existing.locatorShelf,
        locatorPlace: existing.locatorPlace,
        wholesaler: existing.wholesaler?.name,
        wholesaleSku: existing.wholesaleSku,
        barcode: existing.barcode,
      }),
      productAuditFields({
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        wholesalePrice: dto.wholesalePrice,
        vatRate: dto.vatRate,
        stockQuantity: dto.stockQuantity,
        category: category.slug,
        brand: brand.slug,
        featured: Boolean(dto.featured),
        ...locatorOf(dto),
        wholesaler: wholesaler?.name,
        wholesaleSku: dto.wholesaleSku,
        barcode,
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
    if (query.role === "staff") {
      where.role = { name: { in: [...STAFF_ROLES] } };
    } else if (query.role) {
      where.role = { name: query.role };
    }
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

  async createEmployee(actorId: string, input: unknown) {
    const dto = adminCreateEmployeeSchema.parse(input);
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new HttpError(409, "An account with this email already exists.", {
        email: "An account with this email already exists.",
      });
    }
    const roleRow = await prisma.role.findUnique({ where: { name: dto.role } });
    if (!roleRow) throw new HttpError(400, "Unknown role");

    const secret = authenticator.generateSecret();
    const backupCodes = Array.from({ length: 10 }, () => randomToken(4).slice(0, 8).toUpperCase());
    const user = await prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: await hashPassword(dto.password),
        emailVerifiedAt: new Date(),
        totpEnabled: true,
        roleId: roleRow.id,
        totpSecret: {
          create: {
            secret: encrypt(secret),
            confirmedAt: new Date(),
            backupCodes: backupCodes.map(sha256Hex),
          },
        },
      },
    });
    await writeAudit({
      actorId,
      action: "user.create",
      entity: "user",
      entityId: user.id,
      meta: {
        target: user.email,
        changes: [
          { field: "role", from: "—", to: dto.role },
          { field: "displayName", from: "—", to: dto.displayName },
        ],
      },
    });
    const otpauth = authenticator.keyuri(dto.email, "Volt & Co", secret);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: dto.role,
      totpEnabled: true,
      totpSecret: secret,
      otpauth,
      qrDataUrl: await QRCode.toDataURL(otpauth),
      backupCodes,
    };
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
          events: {
            where: { status: "PAID" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
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
          reference: formatOrderReference(order.id),
          status: order.status,
          paymentStatus: order.payment?.status ?? "REQUIRES_PAYMENT",
          total: Number(order.total),
          currency: order.currency,
          createdAt: order.createdAt.toISOString(),
          paidAt: order.events[0]?.createdAt.toISOString()
            ?? (["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED"].includes(order.status)
              ? null
              : order.createdAt.toISOString()),
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

  async listPicking() {
    const rows = await prisma.order.findMany({
      where: { status: { in: ["PAID", "PROCESSING"] } },
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            locatorCode: true,
            barcode: true,
            thumbnailPath: true,
            product: {
              select: {
                locatorStation: true,
                locatorBlock: true,
                locatorShelf: true,
                locatorPlace: true,
                barcode: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      total: rows.length,
      items: rows.map((order) => {
        const items = [...order.items]
          .map((item) => ({
            id: item.id,
            name: item.productName,
            quantity: item.quantity,
            locatorCode:
              item.locatorCode ||
              formatLocatorCode(
                item.product.locatorStation,
                item.product.locatorBlock,
                item.product.locatorShelf,
                item.product.locatorPlace,
              ),
            barcode: item.barcode || item.product.barcode,
            thumbnail: item.thumbnailPath ? `/api/v1/files/${item.thumbnailPath}` : null,
          }))
          .sort((a, b) => a.locatorCode.localeCompare(b.locatorCode) || a.name.localeCompare(b.name));
        return {
          id: order.id,
          reference: formatOrderReference(order.id),
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          summary: items.map((item) => item.name).join(", "),
          items,
        };
      }),
    };
  },

  async startProcess(actorId: string, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "PAID") {
      throw new HttpError(409, "Only paid orders can be moved to processing.");
    }
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: "PROCESSING" },
      }),
      prisma.orderStatusEvent.create({
        data: {
          orderId,
          status: "PROCESSING",
          note: "Staff started warehouse processing.",
        },
      }),
    ]);
    await writeAudit({
      actorId,
      action: "order.process",
      entity: "order",
      entityId: orderId,
      meta: {
        target: formatOrderReference(orderId),
        changes: [{ field: "status", from: "PAID", to: "PROCESSING" }],
      },
    });
    return { id: orderId, status: "PROCESSING" as const, reference: formatOrderReference(orderId) };
  },

  async completePick(actorId: string, orderId: string, input: unknown) {
    const dto = pickOrderSchema.parse(input);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { id: true, productName: true, quantity: true } } },
    });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "PROCESSING") {
      throw new HttpError(409, "Process the order before completing the pick.");
    }

    const submitted = new Map(dto.items.map((item) => [item.id, item.quantity]));
    if (submitted.size !== order.items.length) {
      throw new HttpError(400, "Confirm every line in the order before completing the pick.");
    }
    for (const item of order.items) {
      if (submitted.get(item.id) !== item.quantity) {
        throw new HttpError(400, `Quantity for ${item.productName} does not match the order.`);
      }
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: "SHIPPING" },
      }),
      prisma.orderStatusEvent.create({
        data: {
          orderId,
          status: "SHIPPING",
          note: "Warehouse pick completed. Ready for shipping.",
        },
      }),
    ]);
    await writeAudit({
      actorId,
      action: "order.pick",
      entity: "order",
      entityId: orderId,
      meta: {
        target: formatOrderReference(orderId),
        changes: [{ field: "status", from: "PROCESSING", to: "SHIPPING" }],
      },
    });
    return { id: orderId, status: "SHIPPING" as const, reference: formatOrderReference(orderId) };
  },

  async setOrderStatus(actorId: string, orderId: string, input: unknown) {
    const dto = adminOrderStatusSchema.parse(input);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");

    const becomingWithCourier = dto.status === "WITH_COURIER" && order.status !== "WITH_COURIER";
    const carrier = dto.carrier || order.trackingCarrier;
    const trackingCode = dto.trackingCode || order.trackingCode;
    if (dto.status === "WITH_COURIER" && (!carrier || !trackingCode)) {
      throw new HttpError(400, "Carrier and tracking code are required when handing an order to the courier.");
    }

    let estimatedFrom = order.estimatedDeliveryFrom;
    let estimatedTo = order.estimatedDeliveryTo;
    if (dto.estimatedDeliveryFrom && dto.estimatedDeliveryTo) {
      estimatedFrom = storeDayStart(dto.estimatedDeliveryFrom);
      estimatedTo = storeDayEnd(dto.estimatedDeliveryTo);
    } else if (becomingWithCourier && (!estimatedFrom || !estimatedTo)) {
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
      (dto.status === "WITH_COURIER" && trackingCode
        ? `With the courier via ${carrier} ${trackingCode}`
        : "Updated by staff");

    const nextCarrier = dto.status === "WITH_COURIER" ? carrier : order.trackingCarrier;
    const nextTracking = dto.status === "WITH_COURIER" ? trackingCode : order.trackingCode;
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
          shippedAt: becomingWithCourier ? new Date() : order.shippedAt,
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
        target: formatOrderReference(orderId),
        changes: changes.length
          ? changes
          : [{ field: "status", from: order.status, to: dto.status }],
      },
    });
    if (becomingWithCourier) {
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
        target: formatOrderReference(orderId),
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

  async receiveStock(actorId: string, input: unknown) {
    const dto = receiveStockSchema.parse(input);
    const product = await prisma.product.findUnique({ where: { barcode: dto.barcode } });
    if (!product) throw new HttpError(404, "No product has that barcode");
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: { increment: dto.quantity } },
    });
    await writeAudit({
      actorId,
      action: "product.receive",
      entity: "product",
      entityId: product.id,
      meta: {
        target: product.name,
        changes: [
          { field: "stock", from: String(product.stockQuantity), to: String(updated.stockQuantity) },
          { field: "barcode", from: "—", to: dto.barcode },
        ],
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      barcode: updated.barcode,
      quantity: dto.quantity,
      stockQuantity: updated.stockQuantity,
    };
  },

  async listAdminProducts(rawQuery: unknown) {
    const data = await catalogService.list(rawQuery);
    const extras = await prisma.product.findMany({
      where: { id: { in: data.items.map((item) => item.id) } },
      select: {
        id: true,
        barcode: true,
        wholesaleSku: true,
        wholesalePrice: true,
        vatRate: true,
        wholesaler: { select: { id: true, name: true, email: true } },
      },
    });
    const byId = new Map(extras.map((row) => [row.id, row]));
    return {
      ...data,
      items: data.items.map((item) => {
        const extra = byId.get(item.id);
        return {
          ...item,
          barcode: extra?.barcode ?? null,
          wholesalePrice: extra?.wholesalePrice == null ? null : Number(extra.wholesalePrice),
          vatRate: extra?.vatRate == null ? FINLAND_VAT_RATE : Number(extra.vatRate),
          pricing: productPricing(
            item.price,
            extra?.wholesalePrice == null ? null : Number(extra.wholesalePrice),
            extra?.vatRate == null ? FINLAND_VAT_RATE : Number(extra.vatRate),
          ),
          wholesaler: extra?.wholesaler
            ? { ...extra.wholesaler, sku: extra.wholesaleSku }
            : null,
        };
      }),
    };
  },

  async listWholesalers() {
    const rows = await prisma.wholesaler.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
        products: { select: { id: true, name: true, slug: true, stockQuantity: true, wholesaleSku: true } },
      },
    });
    return { items: rows.map(mapWholesaler) };
  },

  async getWholesaler(id: string) {
    const row = await prisma.wholesaler.findUnique({
      where: { id },
      include: {
        products: {
          select: { id: true, name: true, slug: true, stockQuantity: true, wholesaleSku: true },
          orderBy: { name: "asc" },
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { items: { select: { productName: true, quantity: true } } },
        },
      },
    });
    if (!row) throw new HttpError(404, "Wholesaler not found");
    return mapWholesaler(row);
  },

  async createWholesaler(actorId: string, input: unknown) {
    const dto = adminWholesalerSchema.parse(input);
    const slug = slugify(dto.name);
    if (!slug) throw new HttpError(400, "A wholesaler name is required");
    const clash = await prisma.wholesaler.findFirst({
      where: { OR: [{ slug }, { email: dto.email.toLowerCase() }] },
    });
    if (clash) throw new HttpError(409, "A wholesaler with that name or email already exists");
    const row = await prisma.wholesaler.create({
      data: {
        name: dto.name,
        slug,
        email: dto.email.toLowerCase(),
        contactName: blankToNull(dto.contactName),
        phone: blankToNull(dto.phone),
        address: blankToNull(dto.address),
        notes: blankToNull(dto.notes),
      },
    });
    await writeAudit({
      actorId,
      action: "wholesaler.create",
      entity: "wholesaler",
      entityId: row.id,
      meta: {
        target: row.name,
        changes: [{ field: "record", from: "—", to: row.name }],
      },
    });
    return this.getWholesaler(row.id);
  },

  async updateWholesaler(actorId: string, id: string, input: unknown) {
    const dto = adminWholesalerSchema.parse(input);
    const existing = await prisma.wholesaler.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Wholesaler not found");
    const slug = slugify(dto.name);
    if (!slug) throw new HttpError(400, "A wholesaler name is required");
    if (slug !== existing.slug) {
      const clash = await prisma.wholesaler.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "A wholesaler with that name already exists");
    }
    if (dto.email.toLowerCase() !== existing.email) {
      const clash = await prisma.wholesaler.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (clash) throw new HttpError(409, "A wholesaler with that email already exists");
    }
    await prisma.wholesaler.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        email: dto.email.toLowerCase(),
        contactName: blankToNull(dto.contactName),
        phone: blankToNull(dto.phone),
        address: blankToNull(dto.address),
        notes: blankToNull(dto.notes),
      },
    });
    const changes = diffRecords(
      { name: existing.name, email: existing.email, contact: existing.contactName },
      { name: dto.name, email: dto.email.toLowerCase(), contact: blankToNull(dto.contactName) },
    );
    if (changes.length) {
      await writeAudit({
        actorId,
        action: "wholesaler.update",
        entity: "wholesaler",
        entityId: id,
        meta: { target: dto.name, changes },
      });
    }
    return this.getWholesaler(id);
  },

  async createRestockOrder(actorId: string, wholesalerId: string, input: unknown) {
    const dto = restockOrderSchema.parse(input);
    const wholesaler = await prisma.wholesaler.findUnique({ where: { id: wholesalerId } });
    if (!wholesaler) throw new HttpError(404, "Wholesaler not found");
    const products = await prisma.product.findMany({
      where: { id: { in: dto.items.map((item) => item.productId) } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const lines = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new HttpError(400, "A product on the restock order was not found");
      if (product.wholesalerId !== wholesalerId) {
        throw new HttpError(400, `${product.name} is not supplied by this wholesaler`);
      }
      return {
        productId: product.id,
        productName: product.name,
        wholesaleSku: product.wholesaleSku,
        quantity: item.quantity,
        stockOnHand: product.stockQuantity,
      };
    });
    const draftId = crypto.randomUUID();
    const reference = `VCPO-${draftId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const order = await prisma.purchaseOrder.create({
      data: {
        id: draftId,
        reference,
        wholesalerId,
        note: blankToNull(dto.note),
        items: { create: lines },
      },
      include: { items: true },
    });
    await mail.sendRestockOrder({
      reference: order.reference,
      wholesalerName: wholesaler.name,
      wholesalerEmail: wholesaler.email,
      contactName: wholesaler.contactName,
      note: order.note,
      warehouse: VOLT_WAREHOUSE,
      items: order.items.map((item) => ({
        name: item.productName,
        sku: item.wholesaleSku,
        quantity: item.quantity,
        stockOnHand: item.stockOnHand,
      })),
    });
    await writeAudit({
      actorId,
      action: "purchase_order.create",
      entity: "purchase_order",
      entityId: order.id,
      meta: {
        target: order.reference,
        changes: [
          { field: "wholesaler", from: "—", to: wholesaler.name },
          { field: "lines", from: "—", to: String(order.items.length) },
        ],
      },
    });
    return {
      id: order.id,
      reference: order.reference,
      wholesaler: { id: wholesaler.id, name: wholesaler.name, email: wholesaler.email },
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        sku: item.wholesaleSku,
        quantity: item.quantity,
        stockOnHand: item.stockOnHand,
      })),
    };
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
