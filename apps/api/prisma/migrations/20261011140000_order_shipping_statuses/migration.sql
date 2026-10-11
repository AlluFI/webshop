CREATE TYPE "OrderStatus_new" AS ENUM (
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PROCESSING',
  'SHIPPING',
  'WITH_COURIER',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
);

ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'SHIPPED' THEN 'WITH_COURIER'
    ELSE "status"::text
  END
)::"OrderStatus_new";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT'::"OrderStatus_new";

ALTER TABLE "order_status_events" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'SHIPPED' THEN 'WITH_COURIER'
    ELSE "status"::text
  END
)::"OrderStatus_new";

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
