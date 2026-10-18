import type { CarrierCreateShipmentInput } from "./types.js";

/** PostNord Booking API B2C/B2B service codes we would send on a live booking. */
export const POSTNORD_PRODUCTS = {
  home: { code: "17", name: "PostNord Home" },
  parcel: { code: "18", name: "PostNord Parcel" },
} as const;

export type PostnordParty = {
  name: string;
  streetName: string;
  postcode: string;
  city: string;
  countryCode: string;
  contact?: { email?: string; phone?: string };
};

/**
 * Intermediate payload that mirrors PostNord Booking / EDI instruction fields.
 * Live mode would serialize this to the current Booking API contract.
 */
export type PostnordCreateShipmentRequest = {
  application: { name: string };
  messageDate: string;
  shipment: {
    identification: { orderNumber: string };
    service: { basicServiceCode: string; name: string };
    parties: {
      consignor: PostnordParty;
      consignee: PostnordParty;
    };
    goodsItems: { itemNumber: number; description: string; grossWeightKg?: number }[];
    label: { format: "PDF" };
  };
};

export function postnordProductForMethod(shippingMethod?: string) {
  return shippingMethod === "express" ? POSTNORD_PRODUCTS.parcel : POSTNORD_PRODUCTS.home;
}

function toParty(party: CarrierCreateShipmentInput["sender"]): PostnordParty {
  return {
    name: party.name,
    streetName: party.street,
    postcode: party.postalCode,
    city: party.city,
    countryCode: party.country,
    contact:
      party.email || party.phone
        ? { email: party.email, phone: party.phone }
        : undefined,
  };
}

export function toPostnordCreateShipmentRequest(
  input: CarrierCreateShipmentInput,
): PostnordCreateShipmentRequest {
  const product = postnordProductForMethod(input.shippingMethod);
  return {
    application: { name: "Volt & Co" },
    messageDate: new Date().toISOString(),
    shipment: {
      identification: { orderNumber: input.reference },
      service: { basicServiceCode: product.code, name: product.name },
      parties: {
        consignor: toParty(input.sender),
        consignee: toParty(input.recipient),
      },
      goodsItems: input.parcels.map((parcel, index) => ({
        itemNumber: index + 1,
        description: parcel.description,
        grossWeightKg: parcel.weightKg,
      })),
      label: { format: "PDF" },
    },
  };
}
