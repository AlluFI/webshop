import type { CarrierCreateShipmentInput } from "./types.js";

/** Posti Nextshipping main products we would send on a live create-shipment call. */
export const POSTI_PRODUCTS = {
  express: { code: "2102", name: "Express parcel" },
  home: { code: "2104", name: "Home parcel" },
} as const;

/**
 * Intermediate payload that mirrors Posti Nextshipping / Shipments API fields.
 * Live mode would serialize this to the current Posti XML or JSON contract.
 */
export type PostiCreateShipmentRequest = {
  routing: { id: string; name: string; time: string };
  sender: {
    name: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    email?: string;
    telephone?: string;
  };
  receiver: {
    name: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    email?: string;
    telephone?: string;
  };
  product: { code: string; name: string };
  parcels: { reference: string; weightKg?: number; contentDescription: string }[];
  parcelLabel: { generate: true; responseType: "embedded" };
};

export function postiProductForMethod(shippingMethod?: string) {
  return shippingMethod === "express" ? POSTI_PRODUCTS.express : POSTI_PRODUCTS.home;
}

export function toPostiCreateShipmentRequest(
  input: CarrierCreateShipmentInput,
): PostiCreateShipmentRequest {
  const product = postiProductForMethod(input.shippingMethod);
  const now = new Date();
  const stamp = now.toISOString().replaceAll(/\D/g, "").slice(0, 14);
  return {
    routing: {
      id: input.reference,
      name: "Volt & Co",
      time: stamp,
    },
    sender: {
      name: input.sender.name,
      street: input.sender.street,
      postalCode: input.sender.postalCode,
      city: input.sender.city,
      country: input.sender.country,
      email: input.sender.email,
      telephone: input.sender.phone,
    },
    receiver: {
      name: input.recipient.name,
      street: input.recipient.street,
      postalCode: input.recipient.postalCode,
      city: input.recipient.city,
      country: input.recipient.country,
      email: input.recipient.email,
      telephone: input.recipient.phone,
    },
    product,
    parcels: input.parcels.map((parcel, index) => ({
      reference: `${input.reference}-${index + 1}`,
      weightKg: parcel.weightKg,
      contentDescription: parcel.description,
    })),
    parcelLabel: { generate: true, responseType: "embedded" },
  };
}
