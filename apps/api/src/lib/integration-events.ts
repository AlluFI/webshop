import type { IntegrationEvent } from "@volt/shared";
import { prisma } from "../prisma.js";
import { decrypt } from "./crypto.js";
import { signIntegrationPayload } from "./integration-auth.js";

export async function emitIntegrationEvent(
  type: IntegrationEvent,
  payload: Record<string, unknown>,
) {
  const endpoints = await prisma.integrationEndpoint.findMany({
    where: { active: true, events: { has: type } },
  });
  if (!endpoints.length) return;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    data: payload,
  });
  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      let secret = "";
      try {
        secret = decrypt(endpoint.secretEnc);
      } catch {
        await prisma.integrationEndpoint.update({
          where: { id: endpoint.id },
          data: { lastError: "Webhook secret could not be unlocked", lastSentAt: new Date() },
        });
        return;
      }
      const signature = signIntegrationPayload(secret, timestamp, body);
      try {
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Volt-Event": type,
            "X-Volt-Timestamp": timestamp,
            "X-Volt-Signature": signature,
          },
          body,
          signal: AbortSignal.timeout(4000),
        });
        await prisma.integrationEndpoint.update({
          where: { id: endpoint.id },
          data: {
            lastStatus: response.status,
            lastError: response.ok ? null : `HTTP ${response.status}`,
            lastSentAt: new Date(),
          },
        });
      } catch (error) {
        await prisma.integrationEndpoint.update({
          where: { id: endpoint.id },
          data: {
            lastError: error instanceof Error ? error.message : "Delivery failed",
            lastSentAt: new Date(),
          },
        });
      }
    }),
  );
}

export function emitOrderChange(status: string, payload: Record<string, unknown>) {
  void emitIntegrationEvent("order.updated", payload).catch(() => undefined);
  if (status === "PAID") {
    void emitIntegrationEvent("order.paid", payload).catch(() => undefined);
  }
}
