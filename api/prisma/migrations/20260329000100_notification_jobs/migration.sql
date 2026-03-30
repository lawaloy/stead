-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM (
  'pending',
  'processing',
  'sent',
  'failed',
  'dead_letter'
);

-- CreateTable
CREATE TABLE "NotificationJob" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "status" "NotificationJobStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationJob_status_nextRunAt_idx" ON "NotificationJob"("status", "nextRunAt");
