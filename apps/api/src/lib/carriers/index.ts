import { isShippingCarrier, type ShippingCarrier } from "@volt/shared";
import { config } from "../../config.js";
import { budbeeProductForMethod } from "./budbee-request.js";
import { LiveBudbeeAdapter } from "./budbee-live.js";
import { MockBudbeeAdapter } from "./budbee-mock.js";
import { LivePostiAdapter } from "./posti-live.js";
import { MockPostiAdapter } from "./posti-mock.js";
import { postiProductForMethod } from "./posti-request.js";
import { LivePostnordAdapter } from "./postnord-live.js";
import { MockPostnordAdapter } from "./postnord-mock.js";
import { postnordProductForMethod } from "./postnord-request.js";
import type { CarrierAdapter } from "./types.js";

const adapters = {
  posti: { mock: new MockPostiAdapter(), live: new LivePostiAdapter() },
  postnord: { mock: new MockPostnordAdapter(), live: new LivePostnordAdapter() },
  budbee: { mock: new MockBudbeeAdapter(), live: new LiveBudbeeAdapter() },
} as const;

function isLiveMode(carrier: ShippingCarrier) {
  if (carrier === "posti") return config.postiMode === "live";
  if (carrier === "postnord") return config.postnordMode === "live";
  return config.budbeeMode === "live";
}

export function getCarrierAdapter(carrier: string): CarrierAdapter {
  const resolved = resolveCarrier(carrier);
  return isLiveMode(resolved) ? adapters[resolved].live : adapters[resolved].mock;
}

export function resolveCarrier(value?: string | null): ShippingCarrier {
  return value && isShippingCarrier(value) ? value : "posti";
}

export function carrierProductForMethod(carrier: ShippingCarrier, shippingMethod?: string | null) {
  if (carrier === "posti") return postiProductForMethod(shippingMethod ?? undefined);
  if (carrier === "postnord") return postnordProductForMethod(shippingMethod ?? undefined);
  return budbeeProductForMethod(shippingMethod ?? undefined);
}

export function carrierSource(carrier: ShippingCarrier): "mock" | "live" {
  return isLiveMode(carrier) ? "live" : "mock";
}

export type { CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";
