ALTER TABLE "products" ADD COLUMN "promoPrice" DECIMAL(10,2),
ADD COLUMN "promoStartsAt" TIMESTAMP(3),
ADD COLUMN "promoEndsAt" TIMESTAMP(3),
ADD COLUMN "lowestPriceBeforePromo" DECIMAL(10,2);

CREATE TABLE "product_price_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_promotions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "regularPrice" DECIMAL(10,2) NOT NULL,
    "promoPrice" DECIMAL(10,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "lowestPriceBeforePromo" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_promotions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_price_history_productId_recordedAt_idx" ON "product_price_history"("productId", "recordedAt");
CREATE INDEX "product_promotions_productId_startsAt_idx" ON "product_promotions"("productId", "startsAt");

ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "product_price_history" ("id", "productId", "price", "recordedAt")
SELECT gen_random_uuid()::text, "id", "price", "createdAt" FROM "products";
