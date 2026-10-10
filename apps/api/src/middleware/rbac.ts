import type { NextFunction, Request, Response } from "express";
import {
  can,
  isStaffRole,
  type AdminPermission,
} from "@volt/shared";
import { HttpError } from "../http-error.js";
import { requireAuth, type AuthedRequest } from "./auth.js";

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    const role = (req as AuthedRequest).user.role;
    if (!isStaffRole(role)) {
      next(new HttpError(403, "Staff access required"));
      return;
    }
    next();
  });
}

export function requirePermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireStaff(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      const role = (req as AuthedRequest).user.role;
      if (!can(role, permission)) {
        next(new HttpError(403, "You do not have permission for this action"));
        return;
      }
      next();
    });
  };
}
