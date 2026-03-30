-- AlterTable
ALTER TABLE "OtpCode"
ADD COLUMN "verifyAttempts" INTEGER NOT NULL DEFAULT 0;
