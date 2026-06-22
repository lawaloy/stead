CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dialCode" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "phoneExample" TEXT NOT NULL,
    "authEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultCountry" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Country_isoCode_key" ON "Country"("isoCode");
CREATE INDEX "Country_authEnabled_sortOrder_idx" ON "Country"("authEnabled", "sortOrder");

INSERT INTO "Country" (
    "id",
    "isoCode",
    "name",
    "dialCode",
    "currencyCode",
    "phoneExample",
    "authEnabled",
    "marketEnabled",
    "defaultCountry",
    "sortOrder",
    "updatedAt"
) VALUES
    ('country_ng', 'NG', 'Nigeria', '+234', 'NGN', '08012345678', true, true, true, 1, CURRENT_TIMESTAMP),
    ('country_us', 'US', 'United States', '+1', 'USD', '4155552671', true, false, false, 2, CURRENT_TIMESTAMP),
    ('country_gb', 'GB', 'United Kingdom', '+44', 'GBP', '07911123456', true, false, false, 3, CURRENT_TIMESTAMP);
