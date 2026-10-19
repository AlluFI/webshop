-- Incremental sync
CREATE INDEX IF NOT EXISTS "orders_updatedAt_idx" ON "orders"("updatedAt");
CREATE INDEX IF NOT EXISTS "products_updatedAt_idx" ON "products"("updatedAt");

-- Machine credentials and outbound webhooks
CREATE TABLE "integration_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_api_keys_keyHash_key" ON "integration_api_keys"("keyHash");

CREATE TABLE "integration_endpoints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_endpoints_pkey" PRIMARY KEY ("id")
);

-- Read-only fact views for warehouse BI (Metabase, Looker, Power BI on a replica).
-- No encrypted contact or address columns.
CREATE OR REPLACE VIEW analytics_orders AS
SELECT
  id,
  ('VC-' || UPPER(SUBSTRING(REPLACE(id, '-', ''), 1, 8))) AS reference,
  "userId" AS customer_id,
  status,
  "hasDeviation" AS has_deviation,
  currency,
  subtotal,
  "shippingCost" AS shipping_cost,
  tax,
  total,
  "shippingMethod" AS shipping_method,
  "trackingCarrier" AS tracking_carrier,
  "shippedAt" AS shipped_at,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM orders;

CREATE OR REPLACE VIEW analytics_order_items AS
SELECT
  id,
  "orderId" AS order_id,
  "productId" AS product_id,
  "productName" AS product_name,
  quantity,
  "unitPrice" AS unit_price,
  "lineTotal" AS line_total,
  barcode
FROM order_items;

CREATE OR REPLACE VIEW analytics_products AS
SELECT
  id,
  slug,
  name,
  price,
  "promoPrice" AS promo_price,
  "stockQuantity" AS stock_quantity,
  "categoryId" AS category_id,
  "brandId" AS brand_id,
  featured,
  barcode,
  "wholesaleSku" AS wholesale_sku,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM products;

CREATE OR REPLACE VIEW analytics_customers AS
SELECT
  id,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at,
  "marketingOptIn" AS marketing_opt_in,
  "deletedAt" AS deleted_at,
  "retainUntil" AS retain_until
FROM users
WHERE "roleId" IN (SELECT id FROM roles WHERE name = 'customer');

CREATE OR REPLACE VIEW analytics_order_events AS
SELECT
  id,
  "orderId" AS order_id,
  status,
  "createdAt" AS created_at
FROM order_status_events;
