import { describe, expect, it } from "vitest";
import {
  classifyStaffVoltieIntent,
  extractStaffStatus,
  staffCustomerQuery,
  staffInventoryMode,
  staffInventoryQuery,
  staffProductQuery,
  staffWholesalerQuery,
} from "./staff-voltie-intent.js";

describe("staff voltie intent", () => {
  it("routes warehouse, support, and sales questions", () => {
    expect(classifyStaffVoltieIntent("Find order VC-3FFC7D49")).toBe("order");
    expect(classifyStaffVoltieIntent("Where is VC-3FFC7D49?")).toBe("order");
    expect(classifyStaffVoltieIntent("What's on the pick list?")).toBe("picking");
    expect(classifyStaffVoltieIntent("Where is the Sony WH-1000XM5?")).toBe("locator");
    expect(classifyStaffVoltieIntent("Open tickets")).toBe("tickets");
    expect(classifyStaffVoltieIntent("Find customer alex@volt.test")).toBe("customer");
    expect(classifyStaffVoltieIntent("Sales last week")).toBe("sales");
    expect(classifyStaffVoltieIntent("Refund VC-3FFC7D49")).toBe("refund");
    expect(classifyStaffVoltieIntent("Mark VC-3FFC7D49 as delivered")).toBe("status");
    expect(classifyStaffVoltieIntent("Do you sell Sony headphones?")).toBe("search");
    expect(classifyStaffVoltieIntent("What products are low on stock?")).toBe("inventory");
    expect(classifyStaffVoltieIntent("How much stock of Sony?")).toBe("inventory");
    expect(classifyStaffVoltieIntent("Which products are out of stock?")).toBe("inventory");
    expect(classifyStaffVoltieIntent("how many unpicked order in queue?")).toBe("picking");
    expect(classifyStaffVoltieIntent("show me orders for user alex@volt.test")).toBe("customer");
    expect(classifyStaffVoltieIntent("Which is wholesaler for apple products?")).toBe("wholesaler");
    expect(classifyStaffVoltieIntent("help")).toBe("help");
  });

  it("reads a status verb and strips locator filler", () => {
    expect(extractStaffStatus("start pick on this order")).toBe("PROCESSING");
    expect(extractStaffStatus("mark as delivered")).toBe("DELIVERED");
    expect(extractStaffStatus("hand to the courier")).toBe("WITH_COURIER");
    expect(extractStaffStatus("Hand VC-3FFC7D49 to the courier")).toBe("WITH_COURIER");
    expect(classifyStaffVoltieIntent("Hand VC-3FFC7D49 to the courier")).toBe("status");
    expect(staffProductQuery("Where is the Sony headphones")).toMatch(/sony/i);
    expect(staffCustomerQuery("Find customer alex@volt.test")).toBe("alex@volt.test");
    expect(staffInventoryQuery("What products are low on stock?")).toBe("");
    expect(staffInventoryMode("What products are low on stock?")).toBe("low");
    expect(staffInventoryMode("Which products are out of stock?")).toBe("out");
    expect(staffInventoryQuery("How much stock of Sony")).toMatch(/sony/i);
    expect(staffInventoryMode("How much stock of Sony")).toBe("lookup");
    expect(staffCustomerQuery("show me orders for user alex@volt.test")).toBe("alex@volt.test");
    expect(staffWholesalerQuery("Which is wholesaler for apple products?")).toMatch(/apple/i);
  });
});
