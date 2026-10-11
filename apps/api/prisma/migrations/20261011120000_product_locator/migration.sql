-- AlterTable
ALTER TABLE "products" ADD COLUMN "locatorStation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD COLUMN "locatorBlock" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD COLUMN "locatorShelf" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD COLUMN "locatorPlace" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "order_items" ADD COLUMN "locatorCode" TEXT;

-- Assign aisle-style locators so existing catalog rows are not all 01|01|1|1.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt") AS n FROM products
)
UPDATE products p SET
  "locatorStation" = ((numbered.n - 1) / 64)::int + 1,
  "locatorBlock" = (((numbered.n - 1) / 16)::int % 4) + 1,
  "locatorShelf" = (((numbered.n - 1) / 4)::int % 4) + 1,
  "locatorPlace" = ((numbered.n - 1) % 4) + 1
FROM numbered
WHERE numbered.id = p.id;

UPDATE order_items oi
SET "locatorCode" =
  LPAD(p."locatorStation"::text, 2, '0') || '|' ||
  LPAD(p."locatorBlock"::text, 2, '0') || '|' ||
  p."locatorShelf"::text || '|' ||
  p."locatorPlace"::text
FROM products p
WHERE oi."productId" = p.id;
