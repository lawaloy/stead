CREATE TYPE "GoalStatus" AS ENUM ('active', 'completed', 'cancelled', 'replaced');

ALTER TABLE "Goal"
ADD COLUMN "status" "GoalStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "endedAt" TIMESTAMP(3);

UPDATE "Goal" AS goal
SET
  "status" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Goal" AS newer
      WHERE newer."userId" = goal."userId"
        AND newer."createdAt" > goal."createdAt"
    ) THEN 'replaced'::"GoalStatus"
    ELSE 'cancelled'::"GoalStatus"
  END,
  "endedAt" = (
    SELECT MIN(newer."createdAt")
    FROM "Goal" AS newer
    WHERE newer."userId" = goal."userId"
      AND newer."createdAt" > goal."createdAt"
  )
WHERE goal."isActive" = false;

CREATE INDEX "Goal_userId_createdAt_idx" ON "Goal"("userId", "createdAt");
