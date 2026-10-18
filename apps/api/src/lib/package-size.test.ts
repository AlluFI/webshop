import { describe, expect, it } from "vitest";
import { POSTI_PACKAGE_SIZES, recommendPackage } from "@volt/shared";

const boxes = POSTI_PACKAGE_SIZES.map((box) => ({ ...box, stockQuantity: 8 }));

describe("package size recommendation", () => {
  it("picks the smallest Posti box that fits one item", () => {
    const pick = recommendPackage(
      [{ lengthCm: 22, widthCm: 16, heightCm: 6, weightKg: 0.4, quantity: 1 }],
      boxes,
    );
    expect(pick.code).toBe("S");
    expect(pick.boxCount).toBe(1);
    expect(pick.note).toMatch(/Posti S/);
  });

  it("steps up when volume or weight needs a larger box", () => {
    const byVolume = recommendPackage(
      [{ lengthCm: 20, widthCm: 15, heightCm: 6, weightKg: 0.3, quantity: 4 }],
      boxes,
    );
    expect(byVolume.code).toBe("M");

    const byWeight = recommendPackage(
      [{ lengthCm: 20, widthCm: 15, heightCm: 6, weightKg: 2.2, quantity: 1 }],
      boxes,
    );
    expect(byWeight.code).toBe("M");
  });

  it("rotates an item to fit", () => {
    const pick = recommendPackage(
      [{ lengthCm: 7, widthCm: 16, heightCm: 23, weightKg: 0.5, quantity: 1 }],
      boxes,
    );
    expect(pick.code).toBe("S");
  });

  it("suggests several of the largest box when one is not enough", () => {
    const pick = recommendPackage(
      [{ lengthCm: 38, widthCm: 28, heightCm: 18, weightKg: 8, quantity: 4 }],
      boxes,
    );
    expect(pick.code).toBe("XXL");
    expect(pick.boxCount).toBeGreaterThan(1);
  });

  it("falls back to custom packaging when an item is oversized", () => {
    const pick = recommendPackage(
      [{ lengthCm: 90, widthCm: 70, heightCm: 50, weightKg: 12, quantity: 1 }],
      boxes,
    );
    expect(pick.code).toBeNull();
    expect(pick.name).toBe("Custom packaging");
  });
});
