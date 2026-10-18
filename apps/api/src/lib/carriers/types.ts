import type { ShippingCarrier } from "@volt/shared";

export type CarrierParty = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
  phone?: string;
};

export type CarrierCreateShipmentInput = {
  orderId: string;
  reference: string;
  carrier: ShippingCarrier;
  shippingMethod?: string;
  trackingCode?: string;
  sender: CarrierParty;
  recipient: CarrierParty;
  parcels: { description: string; weightKg?: number }[];
};

export type CarrierLabel = {
  contentType: "text/html" | "application/pdf";
  body: string;
};

export type CarrierShipmentResult = {
  source: "mock" | "live";
  carrier: ShippingCarrier;
  shipmentId: string;
  trackingCode: string;
  trackingUrl: string;
  productCode: string;
  productName: string;
  label: CarrierLabel;
};

export type CarrierAdapter = {
  readonly id: ShippingCarrier;
  createShipment(input: CarrierCreateShipmentInput): Promise<CarrierShipmentResult>;
};
