import { Router } from "express";
import { stockAlertSchema, wishlistItemSchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { contactRateLimit } from "../lib/rate-limit.js";
import { shopService } from "../services/shop.service.js";

export const shopRouter = Router();

shopRouter.get(
  "/shop/config",
  asyncHandler(async (_req, res) => {
    res.json(shopService.config());
  }),
);

shopRouter.get(
  "/wishlist",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await shopService.listWishlist((req as AuthedRequest).user.id));
  }),
);

shopRouter.post(
  "/wishlist",
  requireAuth,
  validate(wishlistItemSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await shopService.addWishlist((req as AuthedRequest).user.id, req.body));
  }),
);

shopRouter.delete(
  "/wishlist/:productId",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await shopService.removeWishlist((req as AuthedRequest).user.id, String(req.params.productId)));
  }),
);

shopRouter.post(
  "/stock-alerts",
  contactRateLimit,
  validate(stockAlertSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await shopService.subscribeStock(req.body));
  }),
);
