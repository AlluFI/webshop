import { prisma } from "../prisma.js";
import { decryptJson, encryptJson } from "./crypto.js";

export type AuditChange = { field: string; from: string; to: string };

export type AuditMeta = {
  target?: string;
  changes?: AuditChange[];
};

export function formatAuditValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "—" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>): AuditChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: AuditChange[] = [];
  for (const field of keys) {
    const from = formatAuditValue(before[field]);
    const to = formatAuditValue(after[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

export function parseAuditMeta(metaEnc: string | null): { target: string; changes: AuditChange[] } {
  if (!metaEnc) return { target: "", changes: [] };
  try {
    const meta = decryptJson<Record<string, unknown>>(metaEnc);
    const target = typeof meta.target === "string" ? meta.target : "";
    if (Array.isArray(meta.changes)) {
      const changes = meta.changes.flatMap((row) => {
        if (!row || typeof row !== "object" || !("field" in row)) return [];
        const item = row as AuditChange;
        return [
          {
            field: String(item.field),
            from: String(item.from ?? "—"),
            to: String(item.to ?? "—"),
          },
        ];
      });
      return { target, changes };
    }
    const changes: AuditChange[] = [];
    if ("from" in meta || "to" in meta) {
      changes.push({
        field: typeof meta.carrier === "string" ? "status" : "value",
        from: formatAuditValue(meta.from),
        to: formatAuditValue(meta.to),
      });
    }
    if (typeof meta.status === "string" && !changes.some((row) => row.field === "status")) {
      changes.push({ field: "status", from: "—", to: meta.status });
    }
    const slug = typeof meta.slug === "string" ? meta.slug : "";
    return { target: target || slug, changes };
  } catch {
    return { target: "", changes: [] };
  }
}

export async function writeAudit(input: {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: AuditMeta | unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metaEnc: input.meta ? encryptJson(input.meta) : null,
    },
  });
}
