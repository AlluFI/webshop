import { HttpError } from "../../http-error.js";
import { config } from "../../config.js";
import { toPostnordCreateShipmentRequest } from "./postnord-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

/**
 * Live PostNord Booking API client.
 * Auth: POST {oauthUrl} grant_type=client_credentials (form body)
 * Book: POST {bookingUrl} with the EDI/booking-shaped mapper payload
 * Label: returned on the booking response or GET {labelUrl}
 *
 * Unused until POSTNORD_MODE=live and credentials are set.
 */
export class LivePostnordAdapter implements CarrierAdapter {
  readonly id = "postnord" as const;

  async authenticate() {
    if (!config.postnordClientId || !config.postnordClientSecret) {
      throw new HttpError(503, "PostNord API credentials are not configured.");
    }
    const response = await fetch(config.postnordOauthUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.postnordClientId,
        client_secret: config.postnordClientSecret,
      }),
    });
    if (!response.ok) {
      throw new HttpError(502, "PostNord authentication failed.");
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new HttpError(502, "PostNord authentication did not return a token.");
    }
    return body.access_token;
  }

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const token = await this.authenticate();
    const payload = toPostnordCreateShipmentRequest(input);
    const response = await fetch(config.postnordBookingUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new HttpError(502, "PostNord booking failed.");
    }
    const body = (await response.json()) as {
      shipmentId?: string;
      id?: string;
      trackingCode?: string;
      trackingId?: string;
      label?: { contentType?: string; content?: string };
    };
    const trackingCode = body.trackingCode || body.trackingId;
    if (!trackingCode) {
      throw new HttpError(502, "PostNord booking did not return a tracking code.");
    }
    return {
      source: "live",
      carrier: "postnord",
      shipmentId: body.shipmentId || body.id || trackingCode,
      trackingCode,
      trackingUrl: `https://tracking.postnord.com/en/?id=${encodeURIComponent(trackingCode)}`,
      productCode: payload.shipment.service.basicServiceCode,
      productName: payload.shipment.service.name,
      label: {
        contentType: body.label?.contentType === "application/pdf" ? "application/pdf" : "text/html",
        body: body.label?.content || "",
      },
    };
  }
}
