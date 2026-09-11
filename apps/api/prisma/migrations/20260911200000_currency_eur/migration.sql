-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "currency" SET DEFAULT 'EUR';
UPDATE "orders" SET "currency" = 'EUR' WHERE "currency" = 'USD';

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "currency" SET DEFAULT 'EUR';
UPDATE "payments" SET "currency" = 'EUR' WHERE "currency" = 'USD';
