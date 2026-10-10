import { describe, expect, it } from "vitest";
import { averageRating, createReviewSchema } from "@volt/shared";

describe("review helpers", () => {
  it("averages published stars to one decimal", () => {
    expect(averageRating([5, 4, 5])).toEqual({ average: 4.7, count: 3 });
    expect(averageRating([])).toEqual({ average: 0, count: 0 });
  });

  it("rejects short review bodies and stars outside 1–5", () => {
    expect(createReviewSchema.safeParse({ stars: 5, body: "Too short" }).success).toBe(false);
    expect(createReviewSchema.safeParse({ stars: 0, body: "This product is genuinely excellent." }).success).toBe(false);
    expect(createReviewSchema.parse({ stars: 4, body: "Solid build and the battery lasts a work week." }).stars).toBe(4);
  });
});
