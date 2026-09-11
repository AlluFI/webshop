import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { orderService } from "../services/order.service.js";

export const webhooksRouter = Router();

webhooksRouter.post(
  "/stripe",
  asyncHandler(async (req: Request, res) => {
    const signature = req.header("stripe-signature");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    res.json(await orderService.applyStripeEvent(raw, signature));
  }),
);
