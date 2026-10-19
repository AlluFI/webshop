-- CreateEnum
CREATE TYPE "SupportTicketKind" AS ENUM ('ENQUIRY', 'CLAIM');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'DONE');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "kind" "SupportTicketKind" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_threads" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "uiBlocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");
CREATE UNIQUE INDEX "support_tickets_externalKey_key" ON "support_tickets"("externalKey");
CREATE INDEX "support_tickets_createdAt_idx" ON "support_tickets"("createdAt");
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");
CREATE INDEX "assistant_threads_userId_idx" ON "assistant_threads"("userId");
CREATE INDEX "assistant_messages_threadId_createdAt_idx" ON "assistant_messages"("threadId", "createdAt");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assistant_threads" ADD CONSTRAINT "assistant_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "assistant_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
