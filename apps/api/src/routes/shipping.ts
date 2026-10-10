import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { shippingService } from "../services/shipping.service.js";

export const shippingRouter = Router();

shippingRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ items: await shippingService.list() });
  }),
);
