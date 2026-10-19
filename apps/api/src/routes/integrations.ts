import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler.js";
import { hasPiiScope, requireIntegrationScope, type IntegrationRequest } from "../lib/integration-auth.js";
import { integrationService } from "../services/integration.service.js";

export const integrationsRouter = Router();

integrationsRouter.get(
  "/orders",
  requireIntegrationScope("orders"),
  asyncHandler(async (req, res) => {
    res.json(await integrationService.exportOrders(req.query));
  }),
);

integrationsRouter.get(
  "/order-items",
  requireIntegrationScope("orders"),
  asyncHandler(async (req, res) => {
    res.json(await integrationService.exportOrderItems(req.query));
  }),
);

integrationsRouter.get(
  "/products",
  requireIntegrationScope("catalog"),
  asyncHandler(async (req, res) => {
    res.json(await integrationService.exportProducts(req.query));
  }),
);

integrationsRouter.get(
  "/customers",
  requireIntegrationScope("customers"),
  asyncHandler(async (req, res) => {
    res.json(await integrationService.exportCustomers(req.query, hasPiiScope(req as IntegrationRequest)));
  }),
);
