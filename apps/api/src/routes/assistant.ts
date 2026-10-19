import { Router } from "express";
import { assistantClaimSchema, assistantEnquirySchema, assistantMessageSchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../lib/rate-limit.js";
import { assistantService } from "../services/assistant.service.js";

export const assistantRouter = Router();
const assistantRateLimit = rateLimit("assistant", 40, 1);

function userId(req: AuthedRequest) {
  return req.user?.id;
}

assistantRouter.post(
  "/threads",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await assistantService.createThread(userId(req as AuthedRequest)));
  }),
);

assistantRouter.get(
  "/threads/:id/messages",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await assistantService.listMessages(String(req.params.id), userId(req as AuthedRequest)));
  }),
);

assistantRouter.post(
  "/threads/:id/messages",
  optionalAuth,
  assistantRateLimit,
  validate(assistantMessageSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await assistantService.chat(String(req.params.id), req.body, userId(req as AuthedRequest)));
  }),
);

assistantRouter.post(
  "/threads/:id/enquiry",
  optionalAuth,
  assistantRateLimit,
  validate(assistantEnquirySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await assistantService.enquiry(String(req.params.id), req.body, userId(req as AuthedRequest)));
  }),
);

assistantRouter.post(
  "/threads/:id/claim",
  optionalAuth,
  assistantRateLimit,
  validate(assistantClaimSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await assistantService.claim(String(req.params.id), req.body, userId(req as AuthedRequest)));
  }),
);
