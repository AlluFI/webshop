-- CreateTable
CREATE TABLE "package_sizes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthCm" DECIMAL(8,2) NOT NULL,
    "widthCm" DECIMAL(8,2) NOT NULL,
    "heightCm" DECIMAL(8,2) NOT NULL,
    "maxWeightKg" DECIMAL(8,3) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "incomingQuantity" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "packageSizeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "package_sizes_code_key" ON "package_sizes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "package_orders_reference_key" ON "package_orders"("reference");

-- CreateIndex
CREATE INDEX "package_orders_packageSizeId_idx" ON "package_orders"("packageSizeId");

-- CreateIndex
CREATE INDEX "package_orders_createdAt_idx" ON "package_orders"("createdAt");

-- AddForeignKey
ALTER TABLE "package_orders" ADD CONSTRAINT "package_orders_packageSizeId_fkey" FOREIGN KEY ("packageSizeId") REFERENCES "package_sizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
