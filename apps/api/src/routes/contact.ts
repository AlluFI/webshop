import { Router } from "express";
import { contactRateLimit } from "../lib/rate-limit.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { contactService } from "../services/contact.service.js";

export const contactRouter = Router();

contactRouter.post(
  "/",
  contactRateLimit,
  asyncHandler(async (req, res) => {
    res.status(201).json(await contactService.submit(req.body));
  }),
);
