import {
  adminPackageSchema,
  orderPackageSchema,
  PACKAGE_SUPPLIER_EMAIL,
  PACKAGE_SUPPLIER_NAME,
  POSTI_PACKAGE_SIZES,
  receivePackageSchema,
  recommendPackage,
  type PackableItem,
  type PackageCandidate,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { writeAudit } from "../lib/audit.js";
import { mail } from "../mail.js";
import { VOLT_WAREHOUSE } from "../lib/restock-email.js";

function moneyNumber(value: { toString(): string } | number) {
  return Number(value);
}

function toCandidate(row: {
  code: string;
  name: string;
  lengthCm: { toString(): string } | number;
  widthCm: { toString(): string } | number;
  heightCm: { toString(): string } | number;
  maxWeightKg: { toString(): string } | number;
  stockQuantity: number;
}): PackageCandidate {
  return {
    code: row.code,
    name: row.name,
    lengthCm: moneyNumber(row.lengthCm),
    widthCm: moneyNumber(row.widthCm),
    heightCm: moneyNumber(row.heightCm),
    maxWeightKg: moneyNumber(row.maxWeightKg),
    stockQuantity: row.stockQuantity,
  };
}

function toDto(row: {
  id: string;
  code: string;
  name: string;
  lengthCm: { toString(): string } | number;
  widthCm: { toString(): string } | number;
  heightCm: { toString(): string } | number;
  maxWeightKg: { toString(): string } | number;
  stockQuantity: number;
  incomingQuantity: number;
  sortOrder: number;
  active: boolean;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    lengthCm: moneyNumber(row.lengthCm),
    widthCm: moneyNumber(row.widthCm),
    heightCm: moneyNumber(row.heightCm),
    maxWeightKg: moneyNumber(row.maxWeightKg),
    stockQuantity: row.stockQuantity,
    incomingQuantity: row.incomingQuantity,
    sortOrder: row.sortOrder,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const packageService = {
  toDto,
  toCandidate,

  async list(includeInactive = true) {
    const rows = await prisma.packageSize.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { sortOrder: "asc" },
    });
    return { items: rows.map(toDto) };
  },

  async candidates() {
    const rows = await prisma.packageSize.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toCandidate);
  },

  recommend(items: PackableItem[], boxes?: PackageCandidate[]) {
    return recommendPackage(items, boxes ?? []);
  },

  async update(actorId: string, id: string, input: unknown) {
    const dto = adminPackageSchema.parse(input);
    const existing = await prisma.packageSize.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Package size not found");
    const row = await prisma.packageSize.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.lengthCm != null ? { lengthCm: dto.lengthCm } : {}),
        ...(dto.widthCm != null ? { widthCm: dto.widthCm } : {}),
        ...(dto.heightCm != null ? { heightCm: dto.heightCm } : {}),
        ...(dto.maxWeightKg != null ? { maxWeightKg: dto.maxWeightKg } : {}),
        ...(dto.stockQuantity != null ? { stockQuantity: dto.stockQuantity } : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
    });
    await writeAudit({
      actorId,
      action: "package.update",
      entity: "package",
      entityId: id,
      meta: { target: row.code, changes: [{ field: "package", from: existing.name, to: row.name }] },
    });
    return toDto(row);
  },

  async orderMore(actorId: string, id: string, input: unknown) {
    const { quantity } = orderPackageSchema.parse(input);
    const existing = await prisma.packageSize.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Package size not found");
    const draftId = crypto.randomUUID();
    const reference = `VCPK-${draftId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const [order, row] = await prisma.$transaction([
      prisma.packageOrder.create({
        data: {
          id: draftId,
          reference,
          packageSizeId: id,
          quantity,
        },
      }),
      prisma.packageSize.update({
        where: { id },
        data: { incomingQuantity: { increment: quantity } },
      }),
    ]);
    await mail.sendPackageOrder({
      reference: order.reference,
      supplierName: PACKAGE_SUPPLIER_NAME,
      supplierEmail: PACKAGE_SUPPLIER_EMAIL,
      warehouse: VOLT_WAREHOUSE,
      item: {
        name: existing.name,
        code: existing.code,
        quantity,
        stockOnHand: existing.stockQuantity,
        dimensions: `${moneyNumber(existing.lengthCm)} × ${moneyNumber(existing.widthCm)} × ${moneyNumber(existing.heightCm)} cm`,
      },
    });
    await writeAudit({
      actorId,
      action: "package_order.create",
      entity: "package_order",
      entityId: order.id,
      meta: {
        target: order.reference,
        changes: [
          { field: "package", from: "—", to: existing.code },
          { field: "quantity", from: "—", to: String(quantity) },
        ],
      },
    });
    return { ...toDto(row), order: { id: order.id, reference: order.reference, quantity } };
  },

  async receive(actorId: string, id: string, input: unknown) {
    const { quantity } = receivePackageSchema.parse(input);
    const existing = await prisma.packageSize.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Package size not found");
    if (quantity > existing.incomingQuantity) {
      throw new HttpError(400, "Cannot receive more boxes than are on order.");
    }
    const row = await prisma.packageSize.update({
      where: { id },
      data: {
        stockQuantity: { increment: quantity },
        incomingQuantity: { decrement: quantity },
      },
    });
    await writeAudit({
      actorId,
      action: "package.receive",
      entity: "package",
      entityId: id,
      meta: {
        target: existing.code,
        changes: [{ field: "stockQuantity", from: String(existing.stockQuantity), to: String(row.stockQuantity) }],
      },
    });
    return toDto(row);
  },

  defaults() {
    return POSTI_PACKAGE_SIZES;
  },
};
