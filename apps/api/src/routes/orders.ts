import { Router } from "express";
import { orderListQuerySchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { readCartCookie } from "../lib/cart-cookie.js";
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
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.refund(
        ctx(req as AuthedRequest),
        String(req.params.id),
        orderToken(req as AuthedRequest),
      ),
    );
  }),
);
