-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CLAIMS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "retainUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "hasDeviation" BOOLEAN NOT NULL DEFAULT false;

UPDATE "orders" SET "hasDeviation" = true WHERE "status" IN ('CANCELLED', 'REFUNDED');
