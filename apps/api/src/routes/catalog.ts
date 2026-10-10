import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { catalogService } from "../services/catalog.service.js";
import { searchRateLimit } from "../lib/rate-limit.js";

export const catalogRouter = Router();

catalogRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    res.json({ items: await catalogService.categories() });
  }),
);

catalogRouter.get(
  "/brands",
  asyncHandler(async (_req, res) => {
    res.json({ items: await catalogService.brands() });
  }),
);

catalogRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    res.json(await catalogService.list(req.query));
  }),
);

catalogRouter.get(
  "/products/:idOrSlug",
  asyncHandler(async (req, res) => {
    res.json(await catalogService.byIdOrSlug(String(req.params.idOrSlug)));
  }),
);

catalogRouter.get(
  "/search/suggest",
  searchRateLimit,
  asyncHandler(async (req, res) => {
    res.json(await catalogService.suggest(req.query));
  }),
);
