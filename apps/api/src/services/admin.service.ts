import { Prisma, type OrderStatus } from "@prisma/client";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import {
  adminAuditQuerySchema,
  adminCategorySchema,
  adminCreateEmployeeSchema,
  adminCustomerListQuerySchema,
  adminOrderDeviationSchema,
  adminOrderStatusSchema,
  createShipmentSchema,
  comparePickingPriority,
  adminProductSchema,
  adminUserListQuerySchema,
  adminUserRoleSchema,
  adminWholesalerSchema,
  receiveStockSchema,
  restockOrderSchema,
  AUDIT_ENTITIES,
  ean13FromIndex,
  carrierTrackingUrl,
  formatLocatorCode,
  formatOrderReference,
  parcelLabelHtml,
  formatRefundNote,
  isDeviationStatus,
  isStaffRole,
  LOW_STOCK_THRESHOLD,
  orderListQuerySchema,
  pickOrderSchema,
  FINLAND_VAT_RATE,
  isOnPromotion,
  productPricing,
  sellingPriceOf,
  slugify,
  staffRefundRequestSchema,
  STAFF_ROLES,
  updateProfileSchema,
  storeCalendarDate,
  storeDayEnd,
  storeDayStart,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { diffRecords, parseAuditMeta, writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { decrypt, decryptJson, decryptOrEmpty, encrypt } from "../lib/crypto.js";
import { hashPassword, randomToken, sha256Hex } from "../lib/hash.js";
import { writeDerivedImages, writePlaceholderImage } from "../lib/images.js";
import { bumpFacetCache, catalogService } from "./catalog.service.js";
import { mail } from "../mail.js";
import { VOLT_WAREHOUSE } from "../lib/restock-email.js";
import { carrierProductForMethod, carrierSource, getCarrierAdapter, resolveCarrier } from "../lib/carriers/index.js";
import { sendOrderShippedMail } from "./order-fulfillment.js";
import { orderService } from "./order.service.js";
import { reviewService } from "./review.service.js";
import { shippingService } from "./shipping.service.js";
import { packageService } from "./package.service.js";
import { listPromotions, syncProductPromo } from "../lib/product-promo.js";
import { addressService } from "./address.service.js";
import { emitOrderChange } from "../lib/integration-events.js";

function shippingSnapshot(enc: string | null | undefined) {
  if (!enc) return null;
  try {
    return decryptJson<{
      recipientName: string;
      line1: string;
      line2?: string;
      city: string;
      region?: string;
      postal: string;
      country?: string;
      countryName?: string;
    }>(enc);
  } catch {
    return null;
  }
}

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

function promoOf(input: { promoPrice?: number | null; promoStartsAt?: Date | null; promoEndsAt?: Date | null }) {
  return {
    promoPrice: input.promoPrice ?? null,
    promoStartsAt: input.promoStartsAt ?? null,
    promoEndsAt: input.promoEndsAt ?? null,
  };
}

function productAuditFields(input: {
  name: string;
  slug: string;
  description: string;
  price: number;
  promoPrice?: number | null;
  promoStartsAt?: Date | null;
  promoEndsAt?: Date | null;
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
  modelCode?: string | null;
  colorName?: string | null;
  warrantyMonths?: number | null;
  warrantyNote?: string | null;
  manufacturerUrl?: string | null;
  brandUrl?: string | null;
  packageContents?: string | null;
  highlights?: string | null;
  releaseYear?: number | null;
  energyClass?: string | null;
}) {
  return {
    name: input.name,
    slug: input.slug,
    price: input.price,
    promoPrice: input.promoPrice ?? "—",
    promoStartsAt: input.promoStartsAt?.toISOString() ?? "—",
    promoEndsAt: input.promoEndsAt?.toISOString() ?? "—",
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
    model: input.modelCode || "—",
    color: input.colorName || "—",
    warrantyMonths: input.warrantyMonths ?? "—",
    warrantyNote: input.warrantyNote || "—",
    manufacturerUrl: input.manufacturerUrl || "—",
    brandUrl: input.brandUrl || "—",
    packageContents: input.packageContents || "—",
    highlights: input.highlights || "—",
    releaseYear: input.releaseYear ?? "—",
    energyClass: input.energyClass || "—",
  };
}

function productDetailsOf(dto: {
  modelCode?: string | null;
  colorName?: string | null;
  warrantyMonths?: number | null;
  warrantyNote?: string | null;
  manufacturerUrl?: string | null;
  brandUrl?: string | null;
  packageContents?: string | null;
  highlights?: string | null;
  releaseYear?: number | null;
  energyClass?: string | null;
}) {
  return {
    modelCode: blankToNull(dto.modelCode),
    colorName: blankToNull(dto.colorName),
    warrantyMonths: dto.warrantyMonths ?? null,
    warrantyNote: blankToNull(dto.warrantyNote),
    manufacturerUrl: blankToNull(dto.manufacturerUrl),
    brandUrl: blankToNull(dto.brandUrl),
    packageContents: blankToNull(dto.packageContents),
    highlights: blankToNull(dto.highlights),
    releaseYear: dto.releaseYear ?? null,
    energyClass: blankToNull(dto.energyClass),
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
        ...productDetailsOf(dto),
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
    await syncProductPromo(prisma, product.id, dto.price, promoOf(dto));
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
          ...productDetailsOf(dto),
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
      await syncProductPromo(tx, id, dto.price, promoOf(dto), {
        regularPrice: Number(existing.price),
        promoPrice: existing.promoPrice == null ? null : Number(existing.promoPrice),
        promoStartsAt: existing.promoStartsAt,
        promoEndsAt: existing.promoEndsAt,
      });
    });
    const changes = diffRecords(
      productAuditFields({
        name: existing.name,
        slug: existing.slug,
        description: existing.description,
        price: Number(existing.price),
        promoPrice: existing.promoPrice == null ? null : Number(existing.promoPrice),
        promoStartsAt: existing.promoStartsAt,
        promoEndsAt: existing.promoEndsAt,
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
        modelCode: existing.modelCode,
        colorName: existing.colorName,
        warrantyMonths: existing.warrantyMonths,
        warrantyNote: existing.warrantyNote,
        manufacturerUrl: existing.manufacturerUrl,
        brandUrl: existing.brandUrl,
        packageContents: existing.packageContents,
        highlights: existing.highlights,
        releaseYear: existing.releaseYear,
        energyClass: existing.energyClass,
      }),
      productAuditFields({
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        promoPrice: dto.promoPrice,
        promoStartsAt: dto.promoStartsAt,
        promoEndsAt: dto.promoEndsAt,
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
        ...productDetailsOf(dto),
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

  async listProductPromotions(id: string) {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new HttpError(404, "Product not found");
    return listPromotions(id);
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
    const where: Prisma.UserWhereInput = {
      role: { name: { in: [...STAFF_ROLES] } },
    };
    if (query.role && query.role !== "staff") {
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

  async listCustomers(rawQuery: unknown) {
    const query = adminCustomerListQuerySchema.parse(rawQuery);
    const where: Prisma.UserWhereInput = { role: { name: "customer" } };
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
        orderBy: { updatedAt: "desc" },
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
        displayName: user.deletedAt ? "Deleted account" : user.displayName,
        email: user.deletedAt ? null : user.email,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        deletedAt: user.deletedAt?.toISOString() ?? null,
        marketingOptIn: user.marketingOptIn,
        retainUntil: user.retainUntil?.toISOString() ?? null,
      })),
    };
  },

  async getCustomer(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        orders: {
          orderBy: { createdAt: "desc" },
          include: {
            payment: { select: { status: true } },
            items: {
              select: {
                id: true,
                productName: true,
                quantity: true,
                unitPrice: true,
                lineTotal: true,
              },
            },
          },
        },
      },
    });
    if (!user || user.role.name !== "customer") {
      throw new HttpError(404, "Customer not found");
    }
    const { items: addresses } = user.deletedAt
      ? { items: [] as Awaited<ReturnType<typeof addressService.list>>["items"] }
      : await addressService.list(user.id);
    const phone = addresses.find((row) => row.isDefault)?.phone || addresses[0]?.phone || "";
    return {
      id: user.id,
      displayName: user.deletedAt ? "Deleted account" : user.displayName,
      email: user.deletedAt ? null : user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
      retainUntil: user.retainUntil?.toISOString() ?? null,
      marketingOptIn: user.marketingOptIn,
      status: user.deletedAt ? "deleted" : "active",
      phone: phone || null,
      addresses,
      orders: user.orders.map((order) => ({
        id: order.id,
        reference: formatOrderReference(order.id),
        status: order.status,
        hasDeviation: order.hasDeviation,
        paymentStatus: order.payment?.status ?? "REQUIRES_PAYMENT",
        total: Number(order.total),
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
        })),
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
    if (!isStaffRole(user.role.name)) {
      throw new HttpError(409, "Customer accounts cannot change role. Add a new employee instead.");
    }
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

  async updateDisplayName(actorId: string, userId: string, input: unknown) {
    const dto = updateProfileSchema.parse(input);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new HttpError(404, "User not found");
    if (!isStaffRole(user.role.name)) {
      throw new HttpError(403, "Customers change their own name from their profile.");
    }
    await prisma.user.update({
      where: { id: userId },
      data: { displayName: dto.displayName },
    });
    await writeAudit({
      actorId,
      action: "user.rename",
      entity: "user",
      entityId: userId,
      meta: {
        target: user.email,
        changes: [{ field: "displayName", from: user.displayName || "—", to: dto.displayName }],
      },
    });
    return { id: userId, displayName: dto.displayName };
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
        let customerName = "";
        try {
          customerName = decrypt(order.contactNameEnc);
        } catch {
          customerName = "";
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
          customerName,
          email: order.user?.email || email,
          hasDeviation: order.hasDeviation,
          shipping: shippingSnapshot(order.shippingAddressEnc),
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
    const [rows, boxes] = await Promise.all([
      prisma.order.findMany({
        where: { status: { in: ["PAID", "PROCESSING", "SHIPPING"] } },
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
                  lengthCm: true,
                  widthCm: true,
                  heightCm: true,
                  weightKg: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      packageService.candidates(),
    ]);
    const queue = [...rows].sort(comparePickingPriority);
    return {
      total: queue.length,
      postiMode: config.postiMode,
      items: queue.map((order) => {
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
            lengthCm: Number(item.product.lengthCm),
            widthCm: Number(item.product.widthCm),
            heightCm: Number(item.product.heightCm),
            weightKg: Number(item.product.weightKg),
          }))
          .sort((a, b) => a.locatorCode.localeCompare(b.locatorCode) || a.name.localeCompare(b.name));
        return {
          id: order.id,
          reference: formatOrderReference(order.id),
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          summary: items.map((item) => item.name).join(", "),
          customerName: decryptOrEmpty(order.contactNameEnc),
          hasDeviation: order.hasDeviation,
          shipping: shippingSnapshot(order.shippingAddressEnc),
          shippingMethod: order.shippingMethod,
          trackingCarrier: order.trackingCarrier,
          trackingCode: order.trackingCode,
          estimatedDeliveryFrom: order.estimatedDeliveryFrom
            ? storeCalendarDate(order.estimatedDeliveryFrom)
            : null,
          estimatedDeliveryTo: order.estimatedDeliveryTo
            ? storeCalendarDate(order.estimatedDeliveryTo)
            : null,
          packaging: packageService.recommend(items, boxes),
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

  async createShipment(actorId: string, orderId: string, input: unknown) {
    const dto = createShipmentSchema.parse(input ?? {});
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { productName: true, quantity: true } } },
    });
    if (!order) throw new HttpError(404, "Order not found");
    if (!["SHIPPING", "WITH_COURIER"].includes(order.status)) {
      throw new HttpError(409, "Finish picking before creating a parcel label.");
    }

    const carrier = resolveCarrier(dto.carrier || order.trackingCarrier);
    const requestedTracking = dto.trackingCode?.trim() || "";
    const shipping = shippingSnapshot(order.shippingAddressEnc);
    const reference = formatOrderReference(order.id);
    const shipmentInput = {
      orderId: order.id,
      reference,
      carrier,
      shippingMethod: order.shippingMethod,
      trackingCode: requestedTracking || undefined,
      sender: {
        name: VOLT_WAREHOUSE.name,
        street: VOLT_WAREHOUSE.line1,
        postalCode: VOLT_WAREHOUSE.postal,
        city: VOLT_WAREHOUSE.city,
        country: "FI",
      },
      recipient: {
        name: shipping?.recipientName || decryptOrEmpty(order.contactNameEnc) || "Customer",
        street: [shipping?.line1, shipping?.line2].filter(Boolean).join(", ") || "—",
        postalCode: shipping?.postal || "",
        city: shipping?.city || "",
        country: shipping?.country || "FI",
        email: decryptOrEmpty(order.contactEmailEnc) || undefined,
        phone: decryptOrEmpty(order.contactPhoneEnc) || undefined,
      },
      parcels: [
        {
          description: order.items.map((item) => `${item.productName} × ${item.quantity}`).join(", "),
        },
      ],
    };

    let result;
    if (
      order.trackingCode &&
      order.trackingCarrier === carrier &&
      (!requestedTracking || requestedTracking === order.trackingCode)
    ) {
      const product = carrierProductForMethod(carrier, order.shippingMethod);
      result = {
        source: carrierSource(carrier),
        carrier,
        shipmentId: order.trackingCode,
        trackingCode: order.trackingCode,
        trackingUrl: carrierTrackingUrl(carrier, order.trackingCode),
        productCode: product.code,
        productName: product.name,
        label: {
          contentType: "text/html" as const,
          body: parcelLabelHtml({
            reference,
            carrier,
            trackingCode: order.trackingCode,
            shippingMethod: order.shippingMethod,
            recipient: shipping,
          }),
        },
      };
    } else {
      result = await getCarrierAdapter(carrier).createShipment(shipmentInput);
      await prisma.order.update({
        where: { id: orderId },
        data: { trackingCarrier: result.carrier, trackingCode: result.trackingCode },
      });
      await writeAudit({
        actorId,
        action: "order.shipment",
        entity: "order",
        entityId: orderId,
        meta: {
          target: reference,
          changes: [
            { field: "carrier", from: order.trackingCarrier ?? "—", to: result.carrier },
            { field: "trackingCode", from: order.trackingCode ?? "—", to: result.trackingCode },
          ],
        },
      });
    }

    return {
      id: orderId,
      reference,
      status: order.status,
      carrier: result.carrier,
      trackingCode: result.trackingCode,
      trackingUrl: result.trackingUrl,
      shipmentId: result.shipmentId,
      productCode: result.productCode,
      productName: result.productName,
      source: result.source,
      label: result.label,
    };
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
          hasDeviation: isDeviationStatus(dto.status) ? true : order.hasDeviation,
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
    emitOrderChange(dto.status, {
      id: orderId,
      reference: formatOrderReference(orderId),
      status: dto.status,
    });
    return orderService.adminGet(orderId);
  },

  async setOrderDeviation(actorId: string, orderId: string, input: unknown) {
    const dto = adminOrderDeviationSchema.parse(input);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    await prisma.order.update({
      where: { id: orderId },
      data: { hasDeviation: dto.hasDeviation },
    });
    await writeAudit({
      actorId,
      action: "order.deviation",
      entity: "order",
      entityId: orderId,
      meta: {
        target: formatOrderReference(orderId),
        changes: [{ field: "hasDeviation", from: String(order.hasDeviation), to: String(dto.hasDeviation) }],
      },
    });
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
        promoPrice: true,
        promoStartsAt: true,
        promoEndsAt: true,
        lowestPriceBeforePromo: true,
        wholesaler: { select: { id: true, name: true, email: true } },
      },
    });
    const byId = new Map(extras.map((row) => [row.id, row]));
    return {
      ...data,
      items: data.items.map((item) => {
        const extra = byId.get(item.id);
        const promoPrice = extra?.promoPrice == null ? null : Number(extra.promoPrice);
        return {
          ...item,
          barcode: extra?.barcode ?? null,
          wholesalePrice: extra?.wholesalePrice == null ? null : Number(extra.wholesalePrice),
          vatRate: extra?.vatRate == null ? FINLAND_VAT_RATE : Number(extra.vatRate),
          promoPrice,
          promoStartsAt: extra?.promoStartsAt?.toISOString() ?? null,
          promoEndsAt: extra?.promoEndsAt?.toISOString() ?? null,
          lowestPriceBeforePromo:
            extra?.lowestPriceBeforePromo == null ? null : Number(extra.lowestPriceBeforePromo),
          onPromotion: isOnPromotion(item.price, promoPrice, extra?.promoStartsAt, extra?.promoEndsAt),
          sellingPrice: sellingPriceOf(item.price, promoPrice, extra?.promoStartsAt, extra?.promoEndsAt),
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
