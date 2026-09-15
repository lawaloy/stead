ALTER TABLE "Transaction"
ADD COLUMN "importFingerprint" TEXT;

CREATE UNIQUE INDEX "Transaction_userId_importFingerprint_key"
ON "Transaction"("userId", "importFingerprint");
