-- Preserve the newest active goal if legacy data contains duplicates.
WITH ranked_active_goals AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS active_rank
  FROM "Goal"
  WHERE "isActive" = true
)
UPDATE "Goal"
SET "isActive" = false
WHERE "id" IN (
  SELECT "id"
  FROM ranked_active_goals
  WHERE active_rank > 1
);

-- PostgreSQL partial indexes enforce the invariant without limiting history.
CREATE UNIQUE INDEX "Goal_one_active_per_user_idx"
ON "Goal" ("userId")
WHERE "isActive" = true;
