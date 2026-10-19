import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { authService } from "../services/auth.service.js";

export const accountRouter = Router();

accountRouter.post(
  "/deletion",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.requestDeletion((req as AuthedRequest).user.id));
  }),
);
