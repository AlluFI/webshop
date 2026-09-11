import { Router } from "express";
import { savedAddressSchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { addressService } from "../services/address.service.js";

export const addressRouter = Router();

addressRouter.use(requireAuth);

addressRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await addressService.list((req as AuthedRequest).user.id));
  }),
);

addressRouter.post(
  "/",
  validate(savedAddressSchema),
  asyncHandler(async (req, res) => {
    const created = await addressService.create((req as AuthedRequest).user.id, req.body);
    res.status(201).json(created);
  }),
);

addressRouter.patch(
  "/:id",
  validate(savedAddressSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await addressService.update((req as AuthedRequest).user.id, String(req.params.id), req.body),
    );
  }),
);

addressRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await addressService.remove((req as AuthedRequest).user.id, String(req.params.id)));
  }),
);
