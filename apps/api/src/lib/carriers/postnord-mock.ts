import { carrierTrackingUrl, parcelLabelHtml, suggestDemoTracking } from "@volt/shared";
import { toPostnordCreateShipmentRequest } from "./postnord-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

export class MockPostnordAdapter implements CarrierAdapter {
  readonly id = "postnord" as const;

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const request = toPostnordCreateShipmentRequest(input);
    const trackingCode = input.trackingCode?.trim() || suggestDemoTracking("postnord", input.reference);
    return {
      source: "mock",
      carrier: "postnord",
      shipmentId: `MOCK-POSTNORD-${input.reference.replaceAll(/\W/g, "")}`,
      trackingCode,
      trackingUrl: carrierTrackingUrl("postnord", trackingCode),
      productCode: request.shipment.service.basicServiceCode,
      productName: request.shipment.service.name,
      label: {
        contentType: "text/html",
        body: parcelLabelHtml({
          reference: input.reference,
          carrier: "postnord",
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
