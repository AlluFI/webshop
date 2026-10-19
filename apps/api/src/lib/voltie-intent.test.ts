import { describe, expect, it } from "vitest";
import {
  classifyVoltieIntent,
  extractEmail,
  extractOrderReference,
  resolveVoltieUtterance,
  searchQueryFrom,
  searchTokens,
  softenVoltieText,
  wantsLatestOrder,
} from "./voltie-intent.js";

describe("voltie intent", () => {
  it("keeps order lookup and claims apart from catalog search", () => {
    expect(classifyVoltieIntent("Do you sell Sony headphones?")).toBe("search");
    expect(classifyVoltieIntent("How long is standard shipping?")).toBe("shipping");
    expect(classifyVoltieIntent("Where is my order VC-23AAA1B2?")).toBe("orders");
    expect(classifyVoltieIntent("Show my latest order")).toBe("orders");
    expect(classifyVoltieIntent("What is my last order?")).toBe("orders");
    expect(wantsLatestOrder("Show my latest order")).toBe(true);
    expect(classifyVoltieIntent("The box arrived damaged")).toBe("claim");
    expect(classifyVoltieIntent("Please email support about this")).toBe("enquiry");
  });

  it("reads a Volt order number and an email", () => {
    expect(extractOrderReference("status of vc-ab12cd34 please")).toBe("VC-AB12CD34");
    expect(extractEmail("Reply to guest@volt.test thanks")).toBe("guest@volt.test");
  });

  it("turns a spoken product question into search tokens", () => {
    expect(searchQueryFrom("Do you sell Sony headphones?")).toBe("Sony headphones");
    expect(searchTokens("Do you sell Sony headphones?")).toEqual(["headphones", "Sony"]);
    expect(searchQueryFrom("What kind of headphones are available?")).toBe("headphones");
    expect(searchTokens("What kind of headphones are available?")).toEqual(["headphones"]);
    expect(searchQueryFrom("Which laptops do you have?")).toBe("laptops");
    expect(classifyVoltieIntent("What kind of headphones are available?")).toBe("search");
  });

  it("corrects shop typos or offers a did-you-mean", () => {
    expect(softenVoltieText("shoe my latest oder").text.toLowerCase()).toBe("show my latest order");
    expect(resolveVoltieUtterance("Show my latest oder").intent).toBe("orders");
    expect(resolveVoltieUtterance("Show my latest oder").note).toMatch(/oder/i);
    expect(resolveVoltieUtterance("Do you sel sony headphons?").intent).toBe("search");
  });
});
