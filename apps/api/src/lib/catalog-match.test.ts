import { describe, expect, it } from "vitest";
import { partitionCatalogHits } from "./catalog-match.js";

const framework = {
  id: "1",
  name: "Framework Laptop 13 DIY Edition",
  description: "A repairable 13.5-inch laptop",
  category: { slug: "computers" },
  brand: { name: "Framework" },
};
const macbook = {
  id: "2",
  name: "Apple MacBook Air 15-inch (M3)",
  description: "Fanless 15-inch notebook",
  category: { slug: "computers" },
  brand: { name: "Apple" },
};
const powerBank = {
  id: "3",
  name: "Anker 737 Power Bank",
  description: "enough headroom to charge a laptop",
  category: { slug: "accessories" },
  brand: { name: "Anker" },
};
const sony = {
  id: "4",
  name: "Sony WH-1000XM5",
  description: "headphones",
  category: { slug: "audio" },
  brand: { name: "Sony" },
};
const bose = {
  id: "5",
  name: "Bose QuietComfort",
  description: "headphones",
  category: { slug: "audio" },
  brand: { name: "Bose" },
};

describe("partitionCatalogHits", () => {
  it("keeps laptops as matches and the power bank as related", () => {
    const { matches, related } = partitionCatalogHits(
      [framework, macbook, powerBank],
      ["laptops"],
      "computers",
    );
    expect(matches.map((item) => item.name)).toEqual([framework.name, macbook.name]);
    expect(related.map((item) => item.name)).toEqual([powerBank.name]);
  });

  it("keeps a branded headphone search on that brand", () => {
    const { matches, related } = partitionCatalogHits([sony, bose, powerBank], ["Sony", "headphones"], "audio");
    expect(matches.map((item) => item.name)).toEqual([sony.name]);
    expect(related.map((item) => item.name)).toEqual([bose.name, powerBank.name]);
  });
});
