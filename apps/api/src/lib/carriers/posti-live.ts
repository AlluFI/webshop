import { HttpError } from "../../http-error.js";
import { config } from "../../config.js";
import { toPostiCreateShipmentRequest } from "./posti-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

/**
 * Live Posti Nextshipping client.
 * Auth: POST {oauthUrl}?grant_type=client_credentials with Basic clientId:secret
 * Create: POST {shipmentUrl} (today XML Prinetti / Nextshipping)
 * Label:  POST {labelUrl}
 *
 * This stays unused until POSTI_MODE=live and credentials are set. The request mapper
 * already builds Posti-shaped sender/receiver/product fields; production would serialize
 * that mapper output to the current Posti contract and parse tracking + label PDF.
 */
export class LivePostiAdapter implements CarrierAdapter {
  readonly id = "posti" as const;

  async authenticate() {
    if (!config.postiClientId || !config.postiClientSecret) {
      throw new HttpError(503, "Posti API credentials are not configured.");
    }
    const basic = Buffer.from(`${config.postiClientId}:${config.postiClientSecret}`).toString("base64");
    const response = await fetch(`${config.postiOauthUrl}?grant_type=client_credentials`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basic}`,
      },
    });
    if (!response.ok) {
      throw new HttpError(502, "Posti authentication failed.");
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new HttpError(502, "Posti authentication did not return a token.");
    }
    return body.access_token;
  }

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const token = await this.authenticate();
    const payload = toPostiCreateShipmentRequest(input);
    const response = await fetch(config.postiShipmentUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new HttpError(502, "Posti create-shipment failed.");
    }
    const body = (await response.json()) as {
      shipmentId?: string;
      trackingCode?: string;
      tracking_code?: string;
      label?: { contentType?: string; content?: string };
    };
    const trackingCode = body.trackingCode || body.tracking_code;
    if (!trackingCode) {
      throw new HttpError(502, "Posti create-shipment did not return a tracking code.");
    }
    return {
      source: "live",
      carrier: "posti",
      shipmentId: body.shipmentId || trackingCode,
      trackingCode,
      trackingUrl: `https://www.posti.fi/en/tracking/${encodeURIComponent(trackingCode)}`,
      productCode: payload.product.code,
      productName: payload.product.name,
      label: {
        contentType: body.label?.contentType === "application/pdf" ? "application/pdf" : "text/html",
        body: body.label?.content || "",
      },
    };
  }
}
