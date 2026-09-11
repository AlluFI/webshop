import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { asyncHandler } from "../middleware/error-handler.js";

export const filesRouter = Router();

filesRouter.get(
  "/:name",
  asyncHandler(async (req, res) => {
    const name = path.basename(String(req.params.name));
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      throw new HttpError(400, "Invalid file name");
    }
    const filePath = path.resolve(config.uploadDir, name);
    const root = path.resolve(config.uploadDir);
    if (!filePath.startsWith(root)) {
      throw new HttpError(400, "Invalid file name");
    }
    try {
      await access(filePath);
    } catch {
      throw new HttpError(404, "File not found");
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    const types: Record<string, string> = {
      ".svg": "image/svg+xml",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const type = types[path.extname(name).toLowerCase()];
    if (type) res.type(type);
    createReadStream(filePath).pipe(res);
  }),
);
