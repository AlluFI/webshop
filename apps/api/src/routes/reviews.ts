import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { reviewService } from "../services/review.service.js";

export const reviewsRouter = Router();

reviewsRouter.get(
  "/products/:idOrSlug/reviews",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const viewerId = (req as AuthedRequest).user?.id;
    res.json(await reviewService.list(String(req.params.idOrSlug), req.query, viewerId));
  }),
);

reviewsRouter.get(
  "/products/:idOrSlug/reviews/eligibility",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await reviewService.eligibility(String(req.params.idOrSlug), user.id));
  }),
);

reviewsRouter.post(
  "/products/:idOrSlug/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await reviewService.create(String(req.params.idOrSlug), user.id, req.body));
  }),
);

reviewsRouter.post(
  "/reviews/:id/vote",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await reviewService.vote(String(req.params.id), user.id));
  }),
);
