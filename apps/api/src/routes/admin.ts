import { Router } from "express";
import multer from "multer";
import { pickOrderSchema, receiveStockSchema, restockOrderSchema, staffRefundRequestSchema } from "@volt/shared";
import { HttpError } from "../http-error.js";
import { config } from "../config.js";
import { saveUpload } from "../lib/images.js";
import { asyncHandler, validate } from "../middleware/error-handler.js";
import { requirePermission, requireStaff } from "../middleware/rbac.js";
import { type AuthedRequest } from "../middleware/auth.js";
import { adminService } from "../services/admin.service.js";
import { salesService } from "../services/sales.service.js";
import { reviewService } from "../services/review.service.js";
import { shippingService } from "../services/shipping.service.js";

export const adminRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

adminRouter.use(requireStaff);

adminRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json({ id: user.id, email: user.email, role: user.role });
  }),
);

adminRouter.get(
  "/audit",
  requirePermission("audit"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.listAudit(req.query));
  }),
);

adminRouter.get(
  "/products",
  requirePermission("products"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.listAdminProducts({ ...req.query, pageSize: req.query.pageSize || "24" }));
  }),
);

adminRouter.post(
  "/products",
  requirePermission("products"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await adminService.createProduct(user.id, req.body));
  }),
);

adminRouter.post(
  "/products/receive",
  requirePermission("products"),
  validate(receiveStockSchema),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.receiveStock(user.id, req.body));
  }),
);

adminRouter.patch(
  "/products/:id",
  requirePermission("products"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.updateProduct(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.delete(
  "/products/:id",
  requirePermission("products"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.deleteProduct(user.id, String(req.params.id)));
  }),
);

adminRouter.post(
  "/products/:id/images",
  requirePermission("products"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    const file = req.file;
    if (!file) throw new HttpError(400, "Choose an image file");
    const saved = await saveUpload(config.uploadDir, file.originalname, file.buffer);
    res.json(
      await adminService.attachImage(user.id, String(req.params.id), {
        path: saved.full,
        thumbPath: saved.thumb,
        altText: String(req.body.altText || ""),
      }),
    );
  }),
);

adminRouter.post(
  "/products/bulk",
  requirePermission("catalog"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    const file = req.file;
    let rows: unknown[] = [];
    if (file) {
      const text = file.buffer.toString("utf8");
      if (file.originalname.toLowerCase().endsWith(".json") || text.trim().startsWith("[")) {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed)) throw new HttpError(400, "JSON bulk upload must be an array");
        rows = parsed;
      } else {
        rows = parseCsv(text);
      }
    } else if (Array.isArray(req.body.items)) {
      rows = req.body.items;
    } else {
      throw new HttpError(400, "Upload a CSV/JSON file or send { items: [] }");
    }
    res.json(await adminService.bulkProducts(user.id, rows));
  }),
);

adminRouter.post(
  "/categories",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await adminService.createCategory(user.id, req.body));
  }),
);

adminRouter.patch(
  "/categories/:id",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.updateCategory(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.delete(
  "/categories/:id",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.deleteCategory(user.id, String(req.params.id)));
  }),
);

adminRouter.get(
  "/sales",
  requirePermission("sales"),
  asyncHandler(async (req, res) => {
    res.json(await salesService.report(req.query));
  }),
);

adminRouter.get(
  "/orders",
  requirePermission("orders"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.listOrders(req.query));
  }),
);

adminRouter.get(
  "/orders/picking",
  requirePermission("picking"),
  asyncHandler(async (_req, res) => {
    res.json(await adminService.listPicking());
  }),
);

adminRouter.post(
  "/orders/:id/process",
  requirePermission("picking"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.startProcess(user.id, String(req.params.id)));
  }),
);

adminRouter.post(
  "/orders/:id/pick",
  requirePermission("picking"),
  validate(pickOrderSchema),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.completePick(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.get(
  "/orders/:id",
  requirePermission("orders"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.getOrder(String(req.params.id)));
  }),
);

adminRouter.post(
  "/orders/:id/status",
  requirePermission("orders"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.setOrderStatus(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.post(
  "/orders/:id/refund",
  requirePermission("refunds"),
  validate(staffRefundRequestSchema),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.refund(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.get(
  "/users",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.listUsers(req.query));
  }),
);

adminRouter.post(
  "/users",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await adminService.createEmployee(user.id, req.body));
  }),
);

adminRouter.post(
  "/users/:id/role",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.assignRole(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.get(
  "/reviews",
  requirePermission("reviews"),
  asyncHandler(async (req, res) => {
    res.json(await reviewService.adminList(req.query));
  }),
);

adminRouter.post(
  "/reviews/:id/moderate",
  requirePermission("reviews"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    const status = req.body?.status === "HIDDEN" ? "HIDDEN" : "PUBLISHED";
    const result = await adminService.moderateReview(user.id, String(req.params.id), status);
    res.json(result);
  }),
);

adminRouter.get(
  "/shipping",
  requirePermission("shipping"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await shippingService.list(true) });
  }),
);

adminRouter.patch(
  "/shipping/:id",
  requirePermission("shipping"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    const row = await adminService.updateShipping(user.id, String(req.params.id), req.body);
    res.json(row);
  }),
);

adminRouter.get(
  "/wholesalers",
  requirePermission("products"),
  asyncHandler(async (_req, res) => {
    res.json(await adminService.listWholesalers());
  }),
);

adminRouter.post(
  "/wholesalers",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await adminService.createWholesaler(user.id, req.body));
  }),
);

adminRouter.get(
  "/wholesalers/:id",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    res.json(await adminService.getWholesaler(String(req.params.id)));
  }),
);

adminRouter.patch(
  "/wholesalers/:id",
  requirePermission("catalog"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(await adminService.updateWholesaler(user.id, String(req.params.id), req.body));
  }),
);

adminRouter.post(
  "/wholesalers/:id/orders",
  requirePermission("catalog"),
  validate(restockOrderSchema),
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user;
    res.status(201).json(await adminService.createRestockOrder(user.id, String(req.params.id), req.body));
  }),
);

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return {
      name: row.name,
      slug: row.slug || undefined,
      description: row.description,
      price: row.price,
      stockQuantity: row.stockQuantity || row.stock,
      category: row.category,
      brand: row.brand,
      featured: row.featured === "true" || row.featured === "1",
      weightKg: row.weightKg,
      lengthCm: row.lengthCm,
      widthCm: row.widthCm,
      heightCm: row.heightCm,
    };
  });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}
