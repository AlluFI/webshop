import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writePlaceholderImage } from "./images.js";

describe("placeholder product images", () => {
  it("writes a Volt-branded SVG named after the slug", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "volt-img-"));
    const filename = await writePlaceholderImage(dir, "volt-bulk-cable", "Volt Bulk Cable");
    expect(filename).toBe("volt-bulk-cable.svg");
    const svg = await readFile(path.join(dir, filename), "utf8");
    expect(svg).toContain("Volt Bulk Cable");
    expect(svg).toContain("Volt &amp; Co");
  });
});
