import { describe, expect, it } from "vitest";
import {
  applyThreadContext,
  classifyVoltieIntent,
  extractEmail,
  extractOrderChoice,
  extractOrderReference,
  lastOrderFromTranscript,
  looksLikeProblem,
  looksLikeWholeOrder,
  matchOrderProduct,
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
    expect(classifyVoltieIntent("I need help with an order")).toBe("orders");
    expect(classifyVoltieIntent("Can you help with my order?")).toBe("orders");
    expect(classifyVoltieIntent("What is my last order?")).toBe("orders");
    expect(wantsLatestOrder("Show my latest order")).toBe(true);
    expect(classifyVoltieIntent("The box arrived damaged")).toBe("claim");
    expect(classifyVoltieIntent("the product is not working")).toBe("claim");
    expect(classifyVoltieIntent("My headphones are missing a power cable")).toBe("claim");
    expect(classifyVoltieIntent("The package was delivered ripped")).toBe("claim");
    expect(looksLikeProblem("The package is missing the cord for loading")).toBe(true);
    expect(extractOrderChoice("2")).toBe(2);
    expect(extractOrderChoice("first")).toBe(1);
    expect(extractOrderChoice("product 2")).toBe(2);
    expect(looksLikeWholeOrder("the package arrived ripped")).toBe(true);
    expect(looksLikeWholeOrder("The package is missing the cord for loading")).toBe(false);
    expect(matchOrderProduct("the Sony is missing a cord", [
      { n: 1, productId: "a", name: "Sony WH-1000XM5" },
      { n: 2, productId: "b", name: "Bose QuietComfort Ultra" },
    ])?.name).toBe("Sony WH-1000XM5");
    expect(matchOrderProduct("the product is not working", [
      { n: 1, productId: "a", name: "Sony WH-1000XM5" },
      { n: 2, productId: "b", name: "Bose QuietComfort Ultra" },
    ])).toBeNull();
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
    expect(softenVoltieText("rosendahlaleksip@gmail.com").text).toBe("rosendahlaleksip@gmail.com");
    expect(softenVoltieText("show me orders for user ros@gmail.com").text).toContain("ros@gmail.com");
    expect(softenVoltieText("shoe my latest oder").text.toLowerCase()).toBe("show my latest order");
    expect(resolveVoltieUtterance("Show my latest oder").intent).toBe("orders");
    expect(resolveVoltieUtterance("Show my latest oder").note).toMatch(/oder/i);
    expect(resolveVoltieUtterance("Do you sel sony headphons?").intent).toBe("search");
  });

  it("keeps a follow-up on the last order in the thread", () => {
    expect(lastOrderFromTranscript([
      { content: "I can see 1 of your order(s).\nVC-A2015E67: With the courier · 1× Sony WH-1000XM5" },
      { content: "the product is not working" },
    ])).toBe("VC-A2015E67");
    expect(applyThreadContext("claim", "the product is not working", "VC-A2015E67")).toEqual({
      intent: "claim",
      reference: "VC-A2015E67",
    });
    expect(applyThreadContext("help", "hmm", "VC-A2015E67")).toEqual({
      intent: "help",
      reference: "VC-A2015E67",
    });
  });
});
