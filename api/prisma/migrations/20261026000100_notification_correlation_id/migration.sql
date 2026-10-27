ALTER TABLE "NotificationJob"
ADD COLUMN "correlationId" TEXT;

UPDATE "NotificationJob"
SET "correlationId" = "id"
WHERE "correlationId" IS NULL;

ALTER TABLE "NotificationJob"
ALTER COLUMN "correlationId" SET NOT NULL;

CREATE INDEX "NotificationJob_correlationId_idx"
ON "NotificationJob"("correlationId");
