import { Router } from "express";
import {
  CHECKOUT_COUNTRIES,
  checkoutPlaceSchema,
  checkoutQuoteSchema,
  checkoutValidateSchema,
} from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidStaffShopping } from "../middleware/rbac.js";
import { applyCartCookie, readCartCookie } from "../lib/cart-cookie.js";
import { checkoutService } from "../services/checkout.service.js";
import { orderService } from "../services/order.service.js";

export const checkoutRouter = Router();

function ctx(req: AuthedRequest) {
  return {
    userId: req.user?.id,
    guestTokenRaw: readCartCookie(req),
  };
}

function orderToken(req: AuthedRequest) {
  return req.header("x-order-token") || undefined;
}

checkoutRouter.get("/countries", (_req, res) => {
  res.json({ items: CHECKOUT_COUNTRIES });
});

checkoutRouter.get("/config", (_req, res) => {
  res.json(orderService.config());
});

checkoutRouter.get(
  "/prefill",
  requireAuth,
  forbidStaffShopping,
  asyncHandler(async (req, res) => {
    res.json(await checkoutService.prefill((req as AuthedRequest).user.id));
  }),
);

checkoutRouter.post(
  "/quote",
  optionalAuth,
  forbidStaffShopping,
  validate(checkoutQuoteSchema),
  asyncHandler(async (req, res) => {
    const result = await checkoutService.quote(ctx(req as AuthedRequest), req.body);
    applyCartCookie(res, result.cookie);
    const { cookie: _cookie, ...body } = result;
    res.json(body);
  }),
);

checkoutRouter.post(
  "/validate",
  optionalAuth,
  forbidStaffShopping,
  validate(checkoutValidateSchema),
  asyncHandler(async (req, res) => {
    const result = await checkoutService.validate(ctx(req as AuthedRequest), req.body);
    applyCartCookie(res, result.cookie);
    const { cookie: _cookie, ...body } = result;
    res.json(body);
  }),
);

checkoutRouter.post(
  "/abandon",
  optionalAuth,
  forbidStaffShopping,
  asyncHandler(async (req, res) => {
    const result = await orderService.abandonOpenCheckout(ctx(req as AuthedRequest));
    applyCartCookie(res, result.cookie);
    const { cookie: _cookie, ...body } = result;
    res.json(body);
  }),
);

checkoutRouter.post(
  "/place",
  optionalAuth,
  forbidStaffShopping,
  validate(checkoutPlaceSchema),
  asyncHandler(async (req, res) => {
    const simulateTimeout =
      process.env.NODE_ENV !== "production" && req.header("x-volt-simulate") === "stripe-timeout";
    const result = await orderService.place(ctx(req as AuthedRequest), req.body, { simulateTimeout });
    applyCartCookie(res, result.cookie);
    const { cookie: _cookie, ...body } = result;
    res.status(201).json(body);
  }),
);

checkoutRouter.get(
  "/orders/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.get(ctx(req as AuthedRequest), String(req.params.id), orderToken(req as AuthedRequest)),
    );
  }),
);

checkoutRouter.post(
  "/orders/:id/sync",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.sync(ctx(req as AuthedRequest), String(req.params.id), orderToken(req as AuthedRequest)),
    );
  }),
);
