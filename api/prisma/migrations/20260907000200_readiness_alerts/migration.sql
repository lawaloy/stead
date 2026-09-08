ALTER TABLE "NotificationJob"
ADD COLUMN "userId" TEXT,
ADD COLUMN "goalId" TEXT,
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "NotificationJob_dedupeKey_key" ON "NotificationJob"("dedupeKey");
CREATE INDEX "NotificationJob_userId_createdAt_idx" ON "NotificationJob"("userId", "createdAt");
CREATE INDEX "NotificationJob_goalId_createdAt_idx" ON "NotificationJob"("goalId", "createdAt");

CREATE TABLE "AlertPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weeklySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "riskAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "weeklyDay" INTEGER NOT NULL DEFAULT 1,
  "weeklyHourLocal" INTEGER NOT NULL DEFAULT 9,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "lastObservedStatus" TEXT NOT NULL,
  "lastObservedScore" INTEGER NOT NULL,
  "lastNotifiedStatus" TEXT,
  "lastNotifiedScore" INTEGER,
  "lastRiskAlertAt" TIMESTAMP(3),
  "lastRecoveryAlertAt" TIMESTAMP(3),
  "lastWeeklySummaryAt" TIMESTAMP(3),
  "lastWeeklySummaryKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlertState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertPreference_userId_key" ON "AlertPreference"("userId");
CREATE UNIQUE INDEX "AlertState_userId_goalId_key" ON "AlertState"("userId", "goalId");
CREATE INDEX "AlertState_userId_updatedAt_idx" ON "AlertState"("userId", "updatedAt");

ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertState" ADD CONSTRAINT "AlertState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertState" ADD CONSTRAINT "AlertState_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
