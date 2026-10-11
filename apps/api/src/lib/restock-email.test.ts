import { describe, expect, it } from "vitest";
import { buildRestockEmail, VOLT_WAREHOUSE } from "./restock-email.js";

describe("restock purchase-order email", () => {
  it("lists products, quantities, and the warehouse ship-to", () => {
    const mail = buildRestockEmail({
      reference: "VCPO-A1B2C3D4",
      wholesalerName: "ElectroNordic Oy",
      wholesalerEmail: "orders@electronordic.test",
      contactName: "Matti",
      note: "Need these before Friday.",
      warehouse: VOLT_WAREHOUSE,
      items: [
        { name: "Sony WH-1000XM5", sku: "VN-SONY-WH-1000XM5", quantity: 12, stockOnHand: 4 },
      ],
    });
    expect(mail.subject).toContain("VCPO-A1B2C3D4");
    expect(mail.text).toContain("Sony WH-1000XM5");
    expect(mail.text).toContain("× 12");
    expect(mail.text).toContain("Mannerheimintie 12");
    expect(mail.text).toContain("Need these before Friday.");
    expect(mail.html).toContain("VN-SONY-WH-1000XM5");
    expect(mail.html).toContain("Volt &amp; Co warehouse");
  });
});
