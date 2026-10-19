import { z } from "zod";

export const INTEGRATION_SCOPES = ["orders", "catalog", "customers", "pii"] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export const INTEGRATION_EVENTS = ["order.updated", "order.paid", "customer.deleted"] as const;
export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

export const integrationExportQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  cursor: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const createIntegrationKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1).default(["orders", "catalog", "customers"]),
});

export const createIntegrationWebhookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://localhost"), {
    message: "Use an https URL (localhost http is allowed in development)",
  }),
  events: z.array(z.enum(INTEGRATION_EVENTS)).min(1),
});
