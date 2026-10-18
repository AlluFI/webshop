import { HttpError } from "../../http-error.js";
import { config } from "../../config.js";
import { toBudbeeCreateOrderRequest } from "./budbee-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

/**
 * Live Budbee Multiple Orders client.
 * Auth: HTTP Basic apiKey:apiSecret
 * Create: POST {baseUrl}/multiple/orders
 *        Content-Type: application/vnd.budbee.multiple.orders-v2+json
 *
 * Unused until BUDBEE_MODE=live and credentials are set.
 */
export class LiveBudbeeAdapter implements CarrierAdapter {
  readonly id = "budbee" as const;

  private credentials() {
    if (!config.budbeeApiKey || !config.budbeeApiSecret) {
      throw new HttpError(503, "Budbee API credentials are not configured.");
    }
    return Buffer.from(`${config.budbeeApiKey}:${config.budbeeApiSecret}`).toString("base64");
  }

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const payload = toBudbeeCreateOrderRequest(input, config.budbeeCollectionId);
    const response = await fetch(`${config.budbeeBaseUrl.replace(/\/$/, "")}/multiple/orders`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.credentials()}`,
        "Content-Type": "application/vnd.budbee.multiple.orders-v2+json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new HttpError(502, "Budbee create-order failed.");
    }
    const body = (await response.json()) as {
      token?: string;
      id?: string;
      tracking?: { number?: string; url?: string };
      parcels?: { packageId?: string; label?: string }[];
      label?: { contentType?: string; content?: string };
    };
    const trackingCode = body.tracking?.number || body.token || body.parcels?.[0]?.packageId;
    if (!trackingCode) {
      throw new HttpError(502, "Budbee create-order did not return a tracking code.");
    }
    return {
      source: "live",
      carrier: "budbee",
      shipmentId: body.id || body.token || trackingCode,
      trackingCode,
      trackingUrl: body.tracking?.url || `https://tracking.budbee.com/${encodeURIComponent(trackingCode)}`,
      productCode: payload.productCodes[0] || "HOME",
      productName: "Budbee Home",
      label: {
        contentType: body.label?.contentType === "application/pdf" ? "application/pdf" : "text/html",
        body: body.label?.content || body.parcels?.[0]?.label || "",
      },
    };
  }
}
