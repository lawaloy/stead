ALTER TABLE "OtpCode"
ADD COLUMN "verificationKeyHash" TEXT,
ADD COLUMN "verificationRequestHash" TEXT,
ADD COLUMN "verificationResponseJson" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OtpCode_verificationKeyHash_key"
ON "OtpCode"("verificationKeyHash");
