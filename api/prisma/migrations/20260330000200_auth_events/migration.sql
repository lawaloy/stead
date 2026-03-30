-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM (
  'otp_requested',
  'otp_request_rate_limited',
  'otp_resend_blocked',
  'otp_verify_failed',
  'otp_verify_locked',
  'otp_verify_succeeded'
);

-- CreateTable
CREATE TABLE "AuthEvent" (
  "id" TEXT NOT NULL,
  "type" "AuthEventType" NOT NULL,
  "phone" TEXT NOT NULL,
  "countryIso" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "attemptNumber" INTEGER,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT,
  "otpCodeId" TEXT,

  CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthEvent_phone_createdAt_idx" ON "AuthEvent"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_type_createdAt_idx" ON "AuthEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthEvent"
ADD CONSTRAINT "AuthEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthEvent"
ADD CONSTRAINT "AuthEvent_otpCodeId_fkey"
FOREIGN KEY ("otpCodeId") REFERENCES "OtpCode"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
