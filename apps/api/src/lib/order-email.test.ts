import { describe, expect, it } from "vitest";
import { buildOrderPaidEmail, formatMoney, humanStatus } from "./order-email.js";

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
  tax: 0,
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
    expect(mail.subject).toContain("af7f062c");
    expect(mail.subject).toMatch(/confirmed/i);
    expect(mail.text).toContain("Framework Laptop 13");
    expect(mail.text).toContain(formatMoney(1299));
    expect(mail.text).toContain("Status: Paid");
    expect(mail.text).toContain("Mannerheimintie 12");
    expect(mail.text).toContain(sample.orderUrl);
    expect(mail.html).toContain("Framework Laptop 13");
    expect(mail.html).toContain("Paid");
    expect(mail.html).toContain("Helsinki");
    expect(mail.html).toContain("View your order");
    expect(mail.html).toContain(sample.items[0]?.thumbnailUrl);
    expect(mail.html).not.toContain("<test>");
    expect(mail.html).toContain("&lt;test&gt;");
  });

  it("humanizes payment status labels", () => {
    expect(humanStatus("PAYMENT_FAILED")).toBe("Payment Failed");
    expect(humanStatus("SUCCEEDED")).toBe("Succeeded");
  });
});
