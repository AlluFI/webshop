export const SHIPPING_CARRIERS = ["posti", "postnord", "budbee"] as const;
export type ShippingCarrier = (typeof SHIPPING_CARRIERS)[number];

function trackingPath(code: string) {
  return code
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export const SHIPPING_CARRIER_META: Record<
  ShippingCarrier,
  { name: string; trackUrl: (code: string) => string; searchUrl: string }
> = {
  posti: {
    name: "Posti",
    searchUrl: "https://www.posti.fi/en/tracking",
    trackUrl: (code) => `https://www.posti.fi/en/tracking/${trackingPath(code)}`,
  },
  postnord: {
    name: "PostNord",
    searchUrl: "https://www.postnord.fi/en/our-tools/track-and-trace",
    trackUrl: (code) => `https://tracking.postnord.com/en/?id=${encodeURIComponent(code)}`,
  },
  budbee: {
    name: "Budbee",
    searchUrl: "https://tracking.budbee.com/",
    trackUrl: (code) => `https://tracking.budbee.com/${encodeURIComponent(code)}`,
  },
};

export function isShippingCarrier(value: string): value is ShippingCarrier {
  return (SHIPPING_CARRIERS as readonly string[]).includes(value);
}

export function carrierName(carrier: string) {
  return isShippingCarrier(carrier) ? SHIPPING_CARRIER_META[carrier].name : carrier;
}

export function carrierTrackingUrl(carrier: string, code: string) {
  if (!code || !isShippingCarrier(carrier)) return "";
  return SHIPPING_CARRIER_META[carrier].trackUrl(code);
}
