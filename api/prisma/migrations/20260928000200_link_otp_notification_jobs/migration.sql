ALTER TABLE "NotificationJob"
ADD COLUMN "otpCodeId" TEXT;

CREATE UNIQUE INDEX "NotificationJob_otpCodeId_key"
ON "NotificationJob"("otpCodeId");

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_otpCodeId_fkey"
FOREIGN KEY ("otpCodeId") REFERENCES "OtpCode"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
