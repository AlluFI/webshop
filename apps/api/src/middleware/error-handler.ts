import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { HttpError } from "../http-error.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      fields: err.fields,
    });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "form";
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({
      error: Object.values(fields)[0] ?? "Invalid input",
      fields,
    });
  }
  console.error(err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

export function validate(schema: ZodTypeAny, source: "body" | "query" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(source === "body" ? req.body : req.query);
      if (source === "body") req.body = parsed;
      else req.query = parsed as Request["query"];
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
