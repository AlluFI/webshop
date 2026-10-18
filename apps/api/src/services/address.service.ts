import { savedAddressSchema, type AddressInput } from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { decrypt, decryptOrEmpty, encrypt, encryptOptional } from "../lib/crypto.js";

const UNREADABLE_ADDRESS = "This saved address could not be unlocked. Add it again.";

function toDto(row: {
  id: string;
  label: string | null;
  recipientNameEnc: string;
  line1Enc: string;
  line2Enc: string | null;
  cityEnc: string;
  regionEnc: string | null;
  postalEnc: string;
  country: string;
  phoneEnc: string | null;
  isDefault: boolean;
}) {
  return {
    id: row.id,
    label: row.label,
    recipientName: decrypt(row.recipientNameEnc),
    line1: decrypt(row.line1Enc),
    line2: decryptOrEmpty(row.line2Enc),
    city: decrypt(row.cityEnc),
    region: decryptOrEmpty(row.regionEnc),
    postal: decrypt(row.postalEnc),
    country: row.country,
    phone: decryptOrEmpty(row.phoneEnc),
    isDefault: row.isDefault,
  };
}

function toDtoOrNull(row: Parameters<typeof toDto>[0]) {
  try {
    return toDto(row);
  } catch {
    return null;
  }
}

function encryptedFields(input: AddressInput) {
  return {
    recipientNameEnc: encrypt(input.recipientName),
    line1Enc: encrypt(input.line1),
    line2Enc: encryptOptional(input.line2 || null),
    cityEnc: encrypt(input.city),
    regionEnc: encryptOptional(input.region || null),
    postalEnc: encrypt(input.postal),
    country: input.country,
    phoneEnc: encryptOptional(input.phone || null),
  };
}

async function unsetDefaults(userId: string, exceptId?: string) {
  await prisma.address.updateMany({
    where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}

export const addressService = {
  toDto,
  encryptedFields,

  async list(userId: string) {
    const rows = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const items: ReturnType<typeof toDto>[] = [];
    for (const row of rows) {
      const dto = toDtoOrNull(row);
      if (dto) items.push(dto);
    }
    return { items };
  },

  async get(userId: string, id: string) {
    const row = await prisma.address.findFirst({ where: { id, userId } });
    if (!row) throw new HttpError(404, "Address not found");
    const dto = toDtoOrNull(row);
    if (!dto) throw new HttpError(409, UNREADABLE_ADDRESS);
    return dto;
  },

  async create(userId: string, input: unknown) {
    const dto = savedAddressSchema.parse(input);
    const count = await prisma.address.count({ where: { userId } });
    const isDefault = dto.isDefault ?? count === 0;
    if (isDefault) await unsetDefaults(userId);
    const row = await prisma.address.create({
      data: {
        userId,
        label: dto.label || null,
        isDefault,
        ...encryptedFields(dto),
      },
    });
    return toDto(row);
  },

  async update(userId: string, id: string, input: unknown) {
    const existing = await prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "Address not found");
    if (!toDtoOrNull(existing)) throw new HttpError(409, UNREADABLE_ADDRESS);
    const dto = savedAddressSchema.parse(input);
    if (dto.isDefault) await unsetDefaults(userId, id);
    const row = await prisma.address.update({
      where: { id },
      data: {
        label: dto.label || null,
        isDefault: dto.isDefault ?? existing.isDefault,
        ...encryptedFields(dto),
      },
    });
    return toDto(row);
  },

  async setDefault(userId: string, id: string) {
    const existing = await prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "Address not found");
    const current = toDtoOrNull(existing);
    if (!current) throw new HttpError(409, UNREADABLE_ADDRESS);
    if (existing.isDefault) return current;
    await unsetDefaults(userId, id);
    const row = await prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });
    return toDto(row);
  },

  async remove(userId: string, id: string) {
    const existing = await prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "Address not found");
    await prisma.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    return { message: "Address removed." };
  },
};
