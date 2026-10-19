import { Prisma } from "@prisma/client";
import {
  createIntegrationKeySchema,
  createIntegrationWebhookSchema,
  formatOrderReference,
  integrationExportQuerySchema,
  type IntegrationScope,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { encrypt } from "../lib/crypto.js";
import { randomToken, sha256Hex } from "../lib/hash.js";
import { config } from "../config.js";
import { writeAudit } from "../lib/audit.js";

function keyPrefixLabel() {
  return config.nodeEnv === "production" ? "volt_live" : "volt_test";
}

function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!iso || !id) return null;
    const updatedAt = new Date(iso);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(updatedAt: Date, id: string) {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
}

function pageWhere(updatedSince?: string, cursor?: string): Prisma.DateTimeFilter | Prisma.StringFilter | object {
  const since = updatedSince ? new Date(updatedSince) : null;
  const mark = decodeCursor(cursor);
  const parts: Prisma.OrderWhereInput[] = [];
  if (since && !Number.isNaN(since.getTime())) {
    parts.push({ updatedAt: { gte: since } });
  }
  if (mark) {
    parts.push({
      OR: [
        { updatedAt: { gt: mark.updatedAt } },
        { AND: [{ updatedAt: mark.updatedAt }, { id: { gt: mark.id } }] },
      ],
    });
  }
  if (!parts.length) return {};
  return parts.length === 1 ? parts[0] : { AND: parts };
}

export const integrationService = {
  async createKey(actorId: string, input: unknown) {
    const dto = createIntegrationKeySchema.parse(input);
    const token = `${keyPrefixLabel()}_${randomToken(24)}`;
    const row = await prisma.integrationApiKey.create({
      data: {
        name: dto.name,
        keyPrefix: token.slice(0, 18),
        keyHash: sha256Hex(token),
        scopes: dto.scopes,
        createdById: actorId,
      },
    });
    await writeAudit({
      actorId,
      action: "integration.key.create",
      entity: "integration_key",
      entityId: row.id,
      meta: { target: dto.name, changes: [{ field: "scopes", from: "—", to: dto.scopes.join(",") }] },
    });
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes,
      token,
      createdAt: row.createdAt.toISOString(),
    };
  },

  async listKeys() {
    const items = await prisma.integrationApiKey.findMany({ orderBy: { createdAt: "desc" } });
    return {
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        keyPrefix: row.keyPrefix,
        scopes: row.scopes,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },

  async revokeKey(actorId: string, id: string) {
    const row = await prisma.integrationApiKey.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Integration key not found");
    await prisma.integrationApiKey.update({
      where: { id },
      data: { revokedAt: row.revokedAt ?? new Date() },
    });
    await writeAudit({
      actorId,
      action: "integration.key.revoke",
      entity: "integration_key",
      entityId: id,
      meta: { target: row.name, changes: [{ field: "revoked", from: "no", to: "yes" }] },
    });
    return { revoked: true };
  },

  async createWebhook(actorId: string, input: unknown) {
    const dto = createIntegrationWebhookSchema.parse(input);
    const secret = `whsec_${randomToken(24)}`;
    const row = await prisma.integrationEndpoint.create({
      data: {
        name: dto.name,
        url: dto.url,
        secretEnc: encrypt(secret),
        events: dto.events,
      },
    });
    await writeAudit({
      actorId,
      action: "integration.webhook.create",
      entity: "integration_webhook",
      entityId: row.id,
      meta: { target: dto.name, changes: [{ field: "url", from: "—", to: dto.url }] },
    });
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      secret,
      createdAt: row.createdAt.toISOString(),
    };
  },

  async listWebhooks() {
    const items = await prisma.integrationEndpoint.findMany({ orderBy: { createdAt: "desc" } });
    return {
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        events: row.events,
        active: row.active,
        lastStatus: row.lastStatus,
        lastError: row.lastError,
        lastSentAt: row.lastSentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },

  async deleteWebhook(actorId: string, id: string) {
    const row = await prisma.integrationEndpoint.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Webhook endpoint not found");
    await prisma.integrationEndpoint.delete({ where: { id } });
    await writeAudit({
      actorId,
      action: "integration.webhook.delete",
      entity: "integration_webhook",
      entityId: id,
      meta: { target: row.name, changes: [{ field: "record", from: row.url, to: "deleted" }] },
    });
    return { deleted: true };
  },

  async exportOrders(rawQuery: unknown) {
    const query = integrationExportQuerySchema.parse(rawQuery);
    const where = pageWhere(query.updatedSince, query.cursor) as Prisma.OrderWhereInput;
    const rows = await prisma.order.findMany({
      where,
      include: { payment: { select: { status: true } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const next = rows[query.limit];
    return {
      items: page.map((order) => ({
        id: order.id,
        reference: formatOrderReference(order.id),
        customerId: order.userId,
        status: order.status,
        paymentStatus: order.payment?.status ?? null,
        hasDeviation: order.hasDeviation,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        shippingCost: Number(order.shippingCost),
        tax: Number(order.tax),
        total: Number(order.total),
        shippingMethod: order.shippingMethod,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      nextCursor: next ? encodeCursor(page[page.length - 1].updatedAt, page[page.length - 1].id) : null,
    };
  },

  async exportOrderItems(rawQuery: unknown) {
    const query = integrationExportQuerySchema.parse(rawQuery);
    const orderWhere = pageWhere(query.updatedSince, query.cursor) as Prisma.OrderWhereInput;
    const rows = await prisma.orderItem.findMany({
      where: { order: orderWhere },
      include: { order: { select: { id: true, updatedAt: true } } },
      orderBy: [{ order: { updatedAt: "asc" } }, { id: "asc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const next = rows[query.limit];
    return {
      items: page.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        barcode: item.barcode,
        updatedAt: item.order.updatedAt.toISOString(),
      })),
      nextCursor: next ? encodeCursor(page[page.length - 1].order.updatedAt, page[page.length - 1].id) : null,
    };
  },

  async exportProducts(rawQuery: unknown) {
    const query = integrationExportQuerySchema.parse(rawQuery);
    const where = pageWhere(query.updatedSince, query.cursor) as Prisma.ProductWhereInput;
    const rows = await prisma.product.findMany({
      where,
      include: { category: { select: { slug: true, name: true } }, brand: { select: { slug: true, name: true } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const next = rows[query.limit];
    return {
      items: page.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: Number(product.price),
        promoPrice: product.promoPrice == null ? null : Number(product.promoPrice),
        stockQuantity: product.stockQuantity,
        category: product.category.slug,
        brand: product.brand.slug,
        featured: product.featured,
        barcode: product.barcode,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      })),
      nextCursor: next ? encodeCursor(page[page.length - 1].updatedAt, page[page.length - 1].id) : null,
    };
  },

  async exportCustomers(rawQuery: unknown, includePii: boolean) {
    const query = integrationExportQuerySchema.parse(rawQuery);
    const where: Prisma.UserWhereInput = {
      role: { name: "customer" },
      ...(pageWhere(query.updatedSince, query.cursor) as Prisma.UserWhereInput),
    };
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const next = rows[query.limit];
    return {
      items: page.map((user) => ({
        id: user.id,
        marketingOptIn: user.marketingOptIn,
        deletedAt: user.deletedAt?.toISOString() ?? null,
        retainUntil: user.retainUntil?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        ...(includePii
          ? { email: user.deletedAt ? null : user.email, displayName: user.displayName }
          : {}),
      })),
      nextCursor: next ? encodeCursor(page[page.length - 1].updatedAt, page[page.length - 1].id) : null,
    };
  },

  hasScope(scopes: string[], scope: IntegrationScope) {
    return scopes.includes(scope);
  },
};
