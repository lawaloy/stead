-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "familyCreatedAt" TIMESTAMP(3);

-- Backfill existing rows from their family's earliest createdAt.
UPDATE "RefreshToken" AS rt
SET "familyCreatedAt" = oldest."createdAt"
FROM (
  SELECT "familyId", MIN("createdAt") AS "createdAt"
  FROM "RefreshToken"
  GROUP BY "familyId"
) AS oldest
WHERE rt."familyId" = oldest."familyId";

UPDATE "RefreshToken"
SET "familyCreatedAt" = "createdAt"
WHERE "familyCreatedAt" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "familyCreatedAt" SET NOT NULL;
