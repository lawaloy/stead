-- Preserve every failed delivery attempt so retry churn and recovered provider
-- outages remain visible to operators after the parent job succeeds.
CREATE TABLE "NotificationFailureAttempt" (
    "id" TEXT NOT NULL,
    "notificationJobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "terminal" BOOLEAN NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationFailureAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationFailureAttempt_failedAt_idx"
ON "NotificationFailureAttempt"("failedAt");

CREATE INDEX "NotificationFailureAttempt_notificationJobId_failedAt_idx"
ON "NotificationFailureAttempt"("notificationJobId", "failedAt");

CREATE INDEX "NotificationJob_status_failedAt_idx"
ON "NotificationJob"("status", "failedAt");

ALTER TABLE "NotificationFailureAttempt"
ADD CONSTRAINT "NotificationFailureAttempt_notificationJobId_fkey"
FOREIGN KEY ("notificationJobId") REFERENCES "NotificationJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
