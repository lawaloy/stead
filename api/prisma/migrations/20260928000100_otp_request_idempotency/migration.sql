ALTER TABLE "OtpCode"
ADD COLUMN "requestKeyHash" TEXT,
ADD COLUMN "requestCompletedAt" TIMESTAMP(3),
ADD COLUMN "developmentOtp" TEXT;

-- OTPs are short-lived, but preserving existing development rows makes this
-- migration safe to apply without deleting data. New requests always use a
-- SHA-256 hash; this prefix cannot collide with that representation.
UPDATE "OtpCode"
SET "requestKeyHash" = 'pre-idempotency:' || "id";

ALTER TABLE "OtpCode"
ALTER COLUMN "requestKeyHash" SET NOT NULL;

CREATE UNIQUE INDEX "OtpCode_requestKeyHash_key" ON "OtpCode"("requestKeyHash");
