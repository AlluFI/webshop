-- AlterTable
ALTER TABLE "products" ADD COLUMN "barcode" TEXT;
ALTER TABLE "order_items" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- Backfill EAN-13 codes (Finland GS1 prefix 640) for existing catalog rows.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt") AS n FROM products WHERE barcode IS NULL
)
UPDATE products p SET barcode =
  '640000' || LPAD(numbered.n::text, 6, '0') || (
    SELECT (
      (10 - (
        (CAST(SUBSTRING(body FROM 1 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 3 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 5 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 7 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 9 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 11 FOR 1) AS int))
        +
        3 * (
         CAST(SUBSTRING(body FROM 2 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 4 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 6 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 8 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 10 FOR 1) AS int) +
         CAST(SUBSTRING(body FROM 12 FOR 1) AS int))
      ) % 10) % 10
    )::text
    FROM (SELECT '640000' || LPAD(numbered.n::text, 6, '0') AS body) check_body
  )
FROM numbered
WHERE numbered.id = p.id;

UPDATE order_items oi
SET barcode = p.barcode
FROM products p
WHERE oi."productId" = p.id AND oi.barcode IS NULL;
