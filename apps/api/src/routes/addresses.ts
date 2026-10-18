import { Router } from "express";
import { isStaffRole, savedAddressSchema } from "@volt/shared";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { addressService } from "../services/address.service.js";
import { HttpError } from "../http-error.js";

export const addressRouter = Router();

addressRouter.use(requireAuth);

function customerAddressBook(req: AuthedRequest) {
  if (isStaffRole(req.user.role)) {
    throw new HttpError(403, "Staff accounts do not keep shipping addresses.");
  }
}

addressRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerAddressBook(user);
    res.json(await addressService.list(user.user.id));
  }),
);

addressRouter.post(
  "/",
  validate(savedAddressSchema),
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerAddressBook(user);
    const created = await addressService.create(user.user.id, req.body);
    res.status(201).json(created);
  }),
);

addressRouter.post(
  "/:id/default",
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerAddressBook(user);
    res.json(await addressService.setDefault(user.user.id, String(req.params.id)));
  }),
);

addressRouter.patch(
  "/:id",
  validate(savedAddressSchema),
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerAddressBook(user);
    res.json(await addressService.update(user.user.id, String(req.params.id), req.body));
  }),
);

addressRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req as AuthedRequest;
    customerAddressBook(user);
    res.json(await addressService.remove(user.user.id, String(req.params.id)));
  }),
);
