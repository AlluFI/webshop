import { describe, expect, it } from "vitest";
import { MockPostnordAdapter } from "./postnord-mock.js";
import { toPostnordCreateShipmentRequest } from "./postnord-request.js";

const input = {
  orderId: "order-1",
  reference: "VC-12AB",
  carrier: "postnord" as const,
  shippingMethod: "standard",
  sender: {
    name: "Volt & Co warehouse",
    street: "Mannerheimintie 12",
    postalCode: "00100",
    city: "Helsinki",
    country: "FI",
  },
  recipient: {
    name: "Aino Virtanen",
    street: "Hämeenkatu 10",
    postalCode: "33100",
    city: "Tampere",
    country: "FI",
  },
  parcels: [{ description: "Headphones × 1", weightKg: 0.4 }],
};

describe("PostNord mock adapter", () => {
  it("maps Volt orders to PostNord booking fields", () => {
    const request = toPostnordCreateShipmentRequest(input);
    expect(request.shipment.service).toEqual({ basicServiceCode: "17", name: "PostNord Home" });
    expect(request.shipment.parties.consignor.city).toBe("Helsinki");
    expect(request.shipment.parties.consignee.name).toBe("Aino Virtanen");
    expect(request.shipment.label.format).toBe("PDF");
  });

  it("returns a PostNord-shaped tracking code and printable HTML label", async () => {
    const result = await new MockPostnordAdapter().createShipment(input);
    expect(result.source).toBe("mock");
    expect(result.trackingCode).toMatch(/^00TEST/);
    expect(result.label.contentType).toBe("text/html");
    expect(result.label.body).toContain("Aino Virtanen");
    expect(result.label.body).toContain(result.trackingCode);
    expect(result.productCode).toBe("17");
  });

  it("uses PostNord Parcel for express checkout", () => {
    expect(
      toPostnordCreateShipmentRequest({ ...input, shippingMethod: "express" }).shipment.service
        .basicServiceCode,
    ).toBe("18");
  });
});
