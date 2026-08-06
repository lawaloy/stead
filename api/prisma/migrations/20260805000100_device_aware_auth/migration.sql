ALTER TABLE "AuthEvent"
ADD COLUMN "deviceHash" TEXT;

CREATE INDEX "AuthEvent_deviceHash_createdAt_idx"
ON "AuthEvent"("deviceHash", "createdAt");
