-- AlterTable
ALTER TABLE "orders" ADD COLUMN "trackingCarrier" TEXT;
ALTER TABLE "orders" ADD COLUMN "trackingCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "estimatedDeliveryFrom" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "estimatedDeliveryTo" TIMESTAMP(3);
