import { Router } from "express";
import {
  customerRefundRequestSchema,
  customerReturnRequestSchema,
  guestOrderLookupSchema,
  orderListQuerySchema,
} from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { readCartCookie } from "../lib/cart-cookie.js";
import { lookupRateLimit } from "../lib/rate-limit.js";
import { orderService } from "../services/order.service.js";

export const ordersRouter = Router();

function ctx(req: AuthedRequest) {
  return {
    userId: req.user?.id,
    guestTokenRaw: readCartCookie(req),
  };
}

function orderToken(req: AuthedRequest) {
  return req.header("x-order-token") || undefined;
}

ordersRouter.post(
  "/lookup",
  lookupRateLimit,
  validate(guestOrderLookupSchema),
  asyncHandler(async (req, res) => {
    res.json(await orderService.lookup(req.body));
  }),
);

ordersRouter.get(
  "/",
  requireAuth,
  validate(orderListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await orderService.list((req as AuthedRequest).user.id, req.query));
  }),
);

ordersRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.get(ctx(req as AuthedRequest), String(req.params.id), orderToken(req as AuthedRequest)),
    );
  }),
);

ordersRouter.post(
  "/:id/cancel",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.cancel(
        ctx(req as AuthedRequest),
        String(req.params.id),
        orderToken(req as AuthedRequest),
      ),
    );
  }),
);

ordersRouter.post(
  "/:id/refund",
  optionalAuth,
  validate(customerRefundRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.refund(
        ctx(req as AuthedRequest),
        String(req.params.id),
        orderToken(req as AuthedRequest),
        false,
        req.body,
      ),
    );
  }),
);

ordersRouter.post(
  "/:id/return",
  optionalAuth,
  validate(customerReturnRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.requestReturn(
        ctx(req as AuthedRequest),
        String(req.params.id),
        orderToken(req as AuthedRequest),
        req.body,
      ),
    );
  }),
);
