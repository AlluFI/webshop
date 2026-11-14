import { Router } from "express";
import {
  createGiftListSchema,
  isStaffRole,
  releaseGiftItemSchema,
  reserveGiftItemSchema,
  updateGiftListSchema,
} from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { lookupRateLimit } from "../lib/rate-limit.js";
import { giftListService } from "../services/gift-list.service.js";
import { HttpError } from "../http-error.js";

export const giftListRouter = Router();

function customerOnly(req: AuthedRequest) {
  if (isStaffRole(req.user.role)) {
    throw new HttpError(403, "Staff accounts cannot share a gift list.");
  }
}

giftListRouter.get(
  "/gift-lists/shared/:token",
  asyncHandler(async (req, res) => {
    res.json(await giftListService.publicByToken(String(req.params.token)));
  }),
);

giftListRouter.post(
  "/gift-lists/shared/:token/items/:productId/reserve",
  lookupRateLimit,
  validate(reserveGiftItemSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await giftListService.reserve(
        String(req.params.token),
        String(req.params.productId),
        req.body,
      ),
    );
  }),
);

giftListRouter.post(
  "/gift-lists/shared/:token/items/:productId/release",
  lookupRateLimit,
  validate(releaseGiftItemSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await giftListService.release(
        String(req.params.token),
        String(req.params.productId),
        req.body,
      ),
    );
  }),
);

giftListRouter.get(
  "/gift-lists",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.json(await giftListService.listMine(user.user.id));
  }),
);

giftListRouter.post(
  "/gift-lists",
  requireAuth,
  validate(createGiftListSchema),
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.status(201).json(await giftListService.create(user.user.id, req.body));
  }),
);

giftListRouter.patch(
  "/gift-lists/:id",
  requireAuth,
  validate(updateGiftListSchema),
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.json(await giftListService.update(user.user.id, String(req.params.id), req.body));
  }),
);

giftListRouter.delete(
  "/gift-lists/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.json(await giftListService.remove(user.user.id, String(req.params.id)));
  }),
);

giftListRouter.post(
  "/gift-lists/:id/rotate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.json(await giftListService.rotate(user.user.id, String(req.params.id)));
  }),
);

giftListRouter.post(
  "/gift-lists/:id/items/:productId/release",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerOnly(user);
    res.json(
      await giftListService.ownerRelease(
        user.user.id,
        String(req.params.id),
        String(req.params.productId),
      ),
    );
  }),
);
