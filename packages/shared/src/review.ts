import { z } from "zod";

export const reviewStarsSchema = z.coerce.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  stars: reviewStarsSchema,
  title: z.string().trim().max(80).optional().or(z.literal("")),
  body: z.string().trim().min(10, "Write at least 10 characters").max(4000, "Review is too long"),
});

export const reviewListQuerySchema = z.object({
  sort: z.enum(["helpful", "newest"]).default("helpful"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const moderateReviewSchema = z.object({
  status: z.enum(["PUBLISHED", "HIDDEN"]),
});

export function averageRating(stars: number[]) {
  if (stars.length === 0) return { average: 0, count: 0 };
  const sum = stars.reduce((total, value) => total + value, 0);
  return {
    average: Math.round((sum / stars.length) * 10) / 10,
    count: stars.length,
  };
}

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
