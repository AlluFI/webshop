import { describe, expect, it } from "vitest";
import { diffRecords, formatAuditValue } from "./audit.js";

describe("audit diffs", () => {
  it("formats empty, boolean, and long values", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(true)).toBe("yes");
    expect(formatAuditValue(false)).toBe("no");
    expect(formatAuditValue(31)).toBe("31");
    expect(formatAuditValue("a".repeat(90)).endsWith("…")).toBe(true);
  });

  it("lists only fields that changed, as old → new", () => {
    expect(
      diffRecords(
        { price: 29.5, stockQuantity: 12, featured: false, name: "Dongle" },
        { price: 31, stockQuantity: 12, featured: true, name: "Dongle" },
      ),
    ).toEqual([
      { field: "price", from: "29.5", to: "31" },
      { field: "featured", from: "no", to: "yes" },
    ]);
  });
});
