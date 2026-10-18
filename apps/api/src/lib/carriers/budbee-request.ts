import type { CarrierCreateShipmentInput } from "./types.js";

/** Budbee Multiple Orders product codes we would send on a live create-order call. */
export const BUDBEE_PRODUCTS = {
  home: { code: "HOME", name: "Budbee Home" },
} as const;

/**
 * Intermediate payload that mirrors Budbee Multiple Orders v2 fields.
 * Live mode posts this to /multiple/orders with the Budbee vendor content type.
 */
export type BudbeeCreateOrderRequest = {
  collectionId: number;
  cart: {
    cartId: string;
    articles: { name: string; reference: string; quantity: number }[];
  };
  delivery: {
    name: string;
    telephoneNumber?: string;
    email?: string;
    address: {
      street: string;
      postalCode: string;
      city: string;
      country: string;
    };
    outsideDoor: false;
    requireSignature: false;
  };
  productCodes: string[];
};

export function budbeeProductForMethod(_shippingMethod?: string) {
  return BUDBEE_PRODUCTS.home;
}

export function toBudbeeCreateOrderRequest(
  input: CarrierCreateShipmentInput,
  collectionId = 0,
): BudbeeCreateOrderRequest {
  const product = budbeeProductForMethod(input.shippingMethod);
  return {
    collectionId,
    cart: {
      cartId: input.reference,
      articles: input.parcels.map((parcel, index) => ({
        name: parcel.description,
        reference: `${input.reference}-${index + 1}`,
        quantity: 1,
      })),
    },
    delivery: {
      name: input.recipient.name,
      telephoneNumber: input.recipient.phone,
      email: input.recipient.email,
      address: {
        street: input.recipient.street,
        postalCode: input.recipient.postalCode,
        city: input.recipient.city,
        country: input.recipient.country,
      },
      outsideDoor: false,
      requireSignature: false,
    },
    productCodes: [product.code],
  };
}
