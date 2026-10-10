import { Prisma } from "@prisma/client";
import {
  EXPRESS_SHIPPING,
  FREE_STANDARD_THRESHOLD,
  STANDARD_SHIPPING,
  adminShippingSchema,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { roundMoney } from "../lib/cart-math.js";

const FALLBACK = [
  {
    code: "standard",
    name: "Standard",
    description: "3–5 business days",
    price: STANDARD_SHIPPING,
    freeThreshold: FREE_STANDARD_THRESHOLD,
    minDays: 3,
    maxDays: 5,
    active: true,
    sortOrder: 0,
  },
  {
    code: "express",
    name: "Express",
    description: "1–2 business days",
    price: EXPRESS_SHIPPING,
    freeThreshold: null as number | null,
    minDays: 1,
    maxDays: 2,
    active: true,
    sortOrder: 1,
  },
];

function formatWindow(start: Date, end: Date) {
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label: `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}–${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
  };
}

function money(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function mapOption(option: {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal | number;
  freeThreshold: Prisma.Decimal | number | null;
  minDays: number;
  maxDays: number;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: option.id,
    code: option.code,
    name: option.name,
    description: option.description,
    price: money(option.price),
    freeThreshold: option.freeThreshold == null ? null : money(option.freeThreshold),
    minDays: option.minDays,
    maxDays: option.maxDays,
    active: option.active,
    sortOrder: option.sortOrder,
  };
}

export const shippingService = {
  async list(includeInactive = false) {
    try {
      const rows = await prisma.shippingOption.findMany({
        where: includeInactive ? undefined : { active: true },
        orderBy: { sortOrder: "asc" },
      });
      if (rows.length) return rows.map(mapOption);
    } catch {
      // table may not exist in a half-migrated test db
    }
    return FALLBACK.filter((row) => includeInactive || row.active).map(mapOption);
  },

  async byCode(code: string) {
    const options = await this.list(true);
    const option = options.find((row) => row.code === code);
    if (!option) throw new HttpError(400, "Unknown shipping method");
    if (!option.active) throw new HttpError(400, "That shipping method is unavailable");
    return option;
  },

  async quote(code: string, subtotal: number) {
    const option = await this.byCode(code);
    const free =
      option.freeThreshold != null && subtotal >= option.freeThreshold ? 0 : option.price;
    const cost = roundMoney(free);
    const label =
      cost === 0 && option.freeThreshold != null
        ? `${option.name} (free over €${option.freeThreshold})`
        : `${option.name} (${option.minDays}–${option.maxDays} business days)`;
    return { option, cost, label };
  },

  estimate(option: { minDays: number; maxDays: number }, from = new Date()) {
    const start = new Date(from);
    start.setUTCDate(start.getUTCDate() + option.minDays);
    const end = new Date(from);
    end.setUTCDate(end.getUTCDate() + option.maxDays);
    return formatWindow(start, end);
  },

  window(start: Date, end: Date) {
    return formatWindow(start, end);
  },

  async update(id: string, input: unknown) {
    const dto = adminShippingSchema.parse(input);
    const existing = await prisma.shippingOption.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Shipping option not found");
    if (dto.maxDays < dto.minDays) {
      throw new HttpError(400, "Maximum days must be at least the minimum");
    }
    const row = await prisma.shippingOption.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description || null,
        price: dto.price,
        freeThreshold: dto.freeThreshold ?? null,
        minDays: dto.minDays,
        maxDays: dto.maxDays,
        active: dto.active ?? existing.active,
      },
    });
    return mapOption(row);
  },
};
