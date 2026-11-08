import { describe, expect, it } from "vitest";
import {
  buildOrderPaidEmail,
  buildOrderPickupReadyEmail,
  buildOrderShippedEmail,
  formatMoney,
  humanStatus,
  shippingLabel,
} from "./order-email.js";

const sample = {
  orderId: "af7f062c-35bd-4d80-a438-528a2c703c0f",
  orderUrl: "http://localhost:8088/orders/af7f062c-35bd-4d80-a438-528a2c703c0f",
  status: "PAID",
  paymentStatus: "SUCCEEDED",
  placedAt: new Date("2026-09-14T17:10:00.000Z"),
  customerName: "Aleksi <test>",
  email: "customer@volt.test",
  phone: "+358401234567",
  items: [
    {
      name: "Framework Laptop 13",
      quantity: 1,
      unitPrice: 1299,
      lineTotal: 1299,
      thumbnailUrl: "http://localhost:8088/api/v1/files/framework-laptop-13.jpg",
      productUrl: "http://localhost:8088/products/framework-laptop-13",
    },
  ],
  subtotal: 1299,
  shippingCost: 0,
  shippingMethod: "standard",
  tax: 263.94,
  total: 1299,
  shipping: {
    recipientName: "Aleksi",
    line1: "Mannerheimintie 12",
    city: "Helsinki",
    postal: "00100",
    countryName: "Finland",
  },
};

describe("order confirmation email", () => {
  it("includes products, totals, status, and shipping in text and html", () => {
    const mail = buildOrderPaidEmail(sample);
    expect(mail.subject).toContain("VC-AF7F062C");
    expect(mail.subject).toMatch(/confirmed/i);
    expect(mail.text).toContain("Framework Laptop 13");
    expect(mail.text).toContain(formatMoney(1299));
    expect(mail.text).toContain("VAT 25.5% (included)");
    expect(mail.text).toContain(formatMoney(263.94));
    expect(mail.text).toContain("Status: Paid");
    expect(mail.text).toContain("Mannerheimintie 12");
    expect(mail.text).toContain(sample.orderUrl);
    expect(mail.html).toContain("Framework Laptop 13");
    expect(mail.html).toContain("VAT 25.5% (included)");
    expect(mail.html).toContain("Paid");
    expect(mail.html).toContain("Helsinki");
    expect(mail.html).toContain("View your order");
    expect(mail.html).toContain(sample.items[0]?.thumbnailUrl);
    expect(mail.html).not.toContain("<test>");
    expect(mail.html).toContain("&lt;test&gt;");
    expect(mail.text).toContain("Ship to");
    expect(shippingLabel("standard", 0)).toContain("Standard");
  });

  it("labels Helsinki warehouse pickup instead of ship-to", () => {
    const mail = buildOrderPaidEmail({ ...sample, shippingMethod: "pickup", shippingCost: 0 });
    expect(mail.text).toContain("Helsinki warehouse pickup");
    expect(mail.text).toContain("Collect from");
    expect(mail.text).toContain("Volt & Co warehouse");
    expect(mail.text).toContain("Mannerheimintie 12");
    expect(mail.text).toContain("Contact address (VAT)");
    expect(mail.text).toContain("Pickup in Helsinki");
    expect(mail.text).not.toContain("Ship to");
    expect(mail.text).not.toContain("Standard (free over");
    expect(mail.html).toContain("Collect from");
    expect(mail.html).toContain("Volt &amp; Co warehouse");
    expect(mail.html).not.toContain("Ship to");
    expect(shippingLabel("pickup", 0)).toMatch(/Pickup in Helsinki/);
  });

  it("humanizes payment status labels", () => {
    expect(humanStatus("PAYMENT_FAILED")).toBe("Payment Failed");
    expect(humanStatus("SUCCEEDED")).toBe("Succeeded");
  });

  it("includes the decline reason and cart link when payment failed", () => {
    const mail = buildOrderPaidEmail({
      ...sample,
      status: "PAYMENT_FAILED",
      paymentStatus: "FAILED",
      failureReason: "Your card has insufficient funds.",
      cartUrl: "http://localhost:8088/cart",
    });
    expect(mail.subject).toMatch(/did not go through/i);
    expect(mail.text).toContain("insufficient funds");
    expect(mail.text).toContain("http://localhost:8088/cart");
    expect(mail.html).toContain("Payment Failed");
    expect(mail.html).toContain("Return to cart");
    expect(mail.html).toContain("Framework Laptop 13");
    expect(mail.html).not.toContain("<test>");
  });
});

describe("order shipped email", () => {
  it("includes tracking, ETA, store order link, and Finnish carrier pages", () => {
    const mail = buildOrderShippedEmail({
      ...sample,
      status: "WITH_COURIER",
      carrier: "posti",
      carrierName: "Posti",
      trackingCode: "JJFI66012700410158170/32109367922",
      trackingUrl: "https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922",
      carrierPages: [
        { name: "Posti", url: "https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922" },
        { name: "PostNord", url: "https://www.postnord.fi/en/our-tools/track-and-trace" },
        { name: "Budbee", url: "https://tracking.budbee.com/" },
      ],
      estimatedDeliveryLabel: "17–19 Sep",
      estimatedDeliveryFrom: "2026-09-17",
      estimatedDeliveryTo: "2026-09-19",
    });
    expect(mail.subject).toMatch(/on the way/i);
    expect(mail.text).toContain("JJFI66012700410158170/32109367922");
    expect(mail.text).toContain("https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922");
    expect(mail.text).toContain("17–19 Sep");
    expect(mail.text).toContain(sample.orderUrl);
    expect(mail.text).toContain("Posti");
    expect(mail.text).toContain("PostNord");
    expect(mail.text).toContain("Budbee");
    expect(mail.html).toContain("Track with Posti");
    expect(mail.html).toContain("View your order at Volt");
    expect(mail.html).toContain("https://www.posti.fi/en/tracking/JJFI66012700410158170/32109367922");
    expect(mail.html).not.toContain("<test>");
  });
});

describe("order pickup-ready email", () => {
  it("tells the customer to collect at the Helsinki warehouse", () => {
    const mail = buildOrderPickupReadyEmail({ ...sample, shippingMethod: "pickup", shippingCost: 0 });
    expect(mail.subject).toMatch(/ready for collection/i);
    expect(mail.text).toContain("Collect from");
    expect(mail.text).toContain("Volt & Co warehouse");
    expect(mail.text).toContain("will not be handed to a courier");
    expect(mail.html).toContain("Ready for collection");
    expect(mail.html).toContain("Mannerheimintie 12");
    expect(mail.html).not.toContain("Ship to");
    expect(mail.html).not.toContain("on the way");
  });
});
