import { describe, expect, it } from "vitest";
import { MockBudbeeAdapter } from "./budbee-mock.js";
import { toBudbeeCreateOrderRequest } from "./budbee-request.js";

const input = {
  orderId: "order-1",
  reference: "VC-12AB",
  carrier: "budbee" as const,
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
    email: "aino@example.test",
    phone: "+358401234567",
  },
  parcels: [{ description: "Headphones × 1", weightKg: 0.4 }],
};

describe("Budbee mock adapter", () => {
  it("maps Volt orders to Budbee Multiple Orders fields", () => {
    const request = toBudbeeCreateOrderRequest(input, 2672);
    expect(request.collectionId).toBe(2672);
    expect(request.productCodes).toEqual(["HOME"]);
    expect(request.cart.cartId).toBe("VC-12AB");
    expect(request.delivery.name).toBe("Aino Virtanen");
    expect(request.delivery.address.city).toBe("Tampere");
  });

  it("returns a Budbee-shaped tracking code and printable HTML label", async () => {
    const result = await new MockBudbeeAdapter().createShipment(input);
    expect(result.source).toBe("mock");
    expect(result.trackingCode).toMatch(/^BUD-DEV-/);
    expect(result.label.contentType).toBe("text/html");
    expect(result.label.body).toContain("Aino Virtanen");
    expect(result.label.body).toContain(result.trackingCode);
    expect(result.productCode).toBe("HOME");
  });
});
