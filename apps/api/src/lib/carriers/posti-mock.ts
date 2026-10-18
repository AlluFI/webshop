import { carrierTrackingUrl, parcelLabelHtml, suggestDemoTracking } from "@volt/shared";
import { toPostiCreateShipmentRequest } from "./posti-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

export class MockPostiAdapter implements CarrierAdapter {
  readonly id = "posti" as const;

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const request = toPostiCreateShipmentRequest(input);
    const trackingCode = input.trackingCode?.trim() || suggestDemoTracking("posti", input.reference);
    const shipmentId = `MOCK-POSTI-${input.reference.replaceAll(/\W/g, "")}`;
    return {
      source: "mock",
      carrier: "posti",
      shipmentId,
      trackingCode,
      trackingUrl: carrierTrackingUrl("posti", trackingCode),
      productCode: request.product.code,
      productName: request.product.name,
      label: {
        contentType: "text/html",
        body: parcelLabelHtml({
          reference: input.reference,
          carrier: "posti",
          trackingCode,
          shippingMethod: input.shippingMethod,
          recipient: {
            recipientName: input.recipient.name,
            line1: input.recipient.street,
            city: input.recipient.city,
            postal: input.recipient.postalCode,
            countryName: input.recipient.country,
          },
        }),
      },
    };
  }
}
