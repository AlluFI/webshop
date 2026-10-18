import { describe, expect, it } from "vitest";
import { formatParcelAddress, parcelLabelHtml, suggestDemoTracking } from "@volt/shared";

describe("parcel labels", () => {
  it("builds a printable demo label with address and tracking", () => {
    const html = parcelLabelHtml({
      reference: "VC-ABC123",
      carrier: "posti",
      trackingCode: "JJFI00000000ABC123",
      shippingMethod: "standard",
      recipient: {
        recipientName: "Aino Virtanen",
        line1: "Hämeenkatu 10",
        city: "Tampere",
        postal: "33100",
        countryName: "Finland",
      },
    });
    expect(html).toContain("Aino Virtanen");
    expect(html).toContain("Hämeenkatu 10");
    expect(html).toContain("JJFI00000000ABC123");
    expect(html).toContain("VC-ABC123");
    expect(html).toContain("Volt &amp; Co warehouse");
    expect(html).toContain("size: A5 portrait");
  });

  it("suggests carrier-shaped demo tracking codes", () => {
    expect(suggestDemoTracking("posti", "VC-12AB")).toMatch(/^JJFI/);
    expect(suggestDemoTracking("postnord", "VC-12AB")).toMatch(/^00TEST/);
    expect(suggestDemoTracking("budbee", "VC-12AB")).toMatch(/^BUD-DEV-/);
  });

  it("skips empty address lines", () => {
    expect(formatParcelAddress({ recipientName: "Aino", line1: "X", city: "Turku", postal: "20100" })).toEqual([
      "Aino",
      "X",
      "20100 Turku",
    ]);
  });
});
