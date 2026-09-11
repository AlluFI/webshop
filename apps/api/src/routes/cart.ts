import { Router } from "express";
import { addCartItemSchema, updateCartItemSchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { applyCartCookie, readCartCookie } from "../lib/cart-cookie.js";
import { cartService, type CartContext } from "../services/cart.service.js";

export const cartRouter = Router();

function ctx(req: AuthedRequest): CartContext {
  return {
    userId: req.user?.id,
    guestTokenRaw: readCartCookie(req),
  };
}

cartRouter.use(optionalAuth);

cartRouter.get(
  "/related",
  asyncHandler(async (req, res) => {
    const result = await cartService.related(ctx(req as AuthedRequest));
    applyCartCookie(res, result.cookie);
    res.json({ items: result.items });
  }),
);

cartRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await cartService.get(ctx(req as AuthedRequest));
    applyCartCookie(res, result.cookie);
    res.json(result.dto);
  }),
);

cartRouter.post(
  "/items",
  validate(addCartItemSchema),
  asyncHandler(async (req, res) => {
    const result = await cartService.addItem(ctx(req as AuthedRequest), req.body);
    applyCartCookie(res, result.cookie);
    res.status(201).json(result.dto);
  }),
);

cartRouter.patch(
  "/items/:itemId",
  validate(updateCartItemSchema),
  asyncHandler(async (req, res) => {
    const result = await cartService.updateItem(
      ctx(req as AuthedRequest),
      String(req.params.itemId),
      req.body,
    );
    applyCartCookie(res, result.cookie);
    res.json(result.dto);
  }),
);

cartRouter.delete(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    const result = await cartService.removeItem(ctx(req as AuthedRequest), String(req.params.itemId));
    applyCartCookie(res, result.cookie);
    res.json(result.dto);
  }),
);

cartRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const result = await cartService.clear(ctx(req as AuthedRequest));
    applyCartCookie(res, result.cookie);
    res.json(result.dto);
  }),
);
