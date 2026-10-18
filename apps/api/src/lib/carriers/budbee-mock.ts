import { carrierTrackingUrl, parcelLabelHtml, suggestDemoTracking } from "@volt/shared";
import { config } from "../../config.js";
import { toBudbeeCreateOrderRequest } from "./budbee-request.js";
import type { CarrierAdapter, CarrierCreateShipmentInput, CarrierShipmentResult } from "./types.js";

export class MockBudbeeAdapter implements CarrierAdapter {
  readonly id = "budbee" as const;

  async createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult> {
    const request = toBudbeeCreateOrderRequest(input, config.budbeeCollectionId);
    const trackingCode = input.trackingCode?.trim() || suggestDemoTracking("budbee", input.reference);
    return {
      source: "mock",
      carrier: "budbee",
      shipmentId: `MOCK-BUDBEE-${input.reference.replaceAll(/\W/g, "")}`,
      trackingCode,
      trackingUrl: carrierTrackingUrl("budbee", trackingCode),
      productCode: request.productCodes[0] || "HOME",
      productName: "Budbee Home",
      label: {
        contentType: "text/html",
        body: parcelLabelHtml({
          reference: input.reference,
          carrier: "budbee",
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
