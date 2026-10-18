import { describe, expect, it } from "vitest";
import { MockPostiAdapter } from "./posti-mock.js";
import { toPostiCreateShipmentRequest } from "./posti-request.js";

const input = {
  orderId: "order-1",
  reference: "VC-12AB",
  carrier: "posti" as const,
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

describe("Posti mock adapter", () => {
  it("maps Volt orders to Posti create-shipment fields", () => {
    const request = toPostiCreateShipmentRequest(input);
    expect(request.product).toEqual({ code: "2104", name: "Home parcel" });
    expect(request.sender.city).toBe("Helsinki");
    expect(request.receiver.name).toBe("Aino Virtanen");
    expect(request.parcelLabel.generate).toBe(true);
  });

  it("returns a JJFI tracking code and printable HTML label", async () => {
    const result = await new MockPostiAdapter().createShipment(input);
    expect(result.source).toBe("mock");
    expect(result.trackingCode).toMatch(/^JJFI/);
    expect(result.label.contentType).toBe("text/html");
    expect(result.label.body).toContain("Aino Virtanen");
    expect(result.label.body).toContain(result.trackingCode);
    expect(result.productCode).toBe("2104");
  });

  it("prints a manually supplied tracking number", async () => {
    const trackingCode = "JJFI66012700410158170";
    const result = await new MockPostiAdapter().createShipment({ ...input, trackingCode });
    expect(result.trackingCode).toBe(trackingCode);
    expect(result.label.body).toContain(trackingCode);
  });

  it("uses Express parcel for express checkout", () => {
    expect(toPostiCreateShipmentRequest({ ...input, shippingMethod: "express" }).product.code).toBe("2102");
  });
});
