import { describe, expect, it } from "vitest";
import { can } from "@volt/shared";

describe("staff role permissions", () => {
  it("limits warehouse to products, orders, and picking", () => {
    expect(can("warehouse", "products")).toBe(true);
    expect(can("warehouse", "orders")).toBe(true);
    expect(can("warehouse", "picking")).toBe(true);
    expect(can("warehouse", "catalog")).toBe(false);
    expect(can("warehouse", "sales")).toBe(false);
    expect(can("warehouse", "refunds")).toBe(false);
    expect(can("warehouse", "users")).toBe(false);
    expect(can("warehouse", "reviews")).toBe(false);
    expect(can("warehouse", "shipping")).toBe(false);
    expect(can("warehouse", "audit")).toBe(false);
  });

  it("keeps sales on catalog and reporting, without refunds", () => {
    expect(can("sales", "products")).toBe(true);
    expect(can("sales", "catalog")).toBe(true);
    expect(can("sales", "sales")).toBe(true);
    expect(can("sales", "refunds")).toBe(false);
  });
});
