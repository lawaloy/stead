CREATE TYPE "AlertStabilityStatus" AS ENUM ('stable', 'warning', 'critical');

ALTER TABLE "AlertState"
ALTER COLUMN "lastObservedStatus" TYPE "AlertStabilityStatus"
USING "lastObservedStatus"::"AlertStabilityStatus",
ALTER COLUMN "lastNotifiedStatus" TYPE "AlertStabilityStatus"
USING "lastNotifiedStatus"::"AlertStabilityStatus";
