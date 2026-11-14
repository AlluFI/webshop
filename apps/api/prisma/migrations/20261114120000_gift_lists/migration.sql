-- CreateTable
CREATE TABLE "gift_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_list_items" (
    "id" TEXT NOT NULL,
    "giftListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3),
    "claimTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_lists_shareToken_key" ON "gift_lists"("shareToken");

-- CreateIndex
CREATE INDEX "gift_lists_userId_idx" ON "gift_lists"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "gift_list_items_giftListId_productId_key" ON "gift_list_items"("giftListId", "productId");

-- CreateIndex
CREATE INDEX "gift_list_items_giftListId_idx" ON "gift_list_items"("giftListId");

-- CreateIndex
CREATE INDEX "gift_list_items_productId_idx" ON "gift_list_items"("productId");

-- AddForeignKey
ALTER TABLE "gift_lists" ADD CONSTRAINT "gift_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_list_items" ADD CONSTRAINT "gift_list_items_giftListId_fkey" FOREIGN KEY ("giftListId") REFERENCES "gift_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_list_items" ADD CONSTRAINT "gift_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
