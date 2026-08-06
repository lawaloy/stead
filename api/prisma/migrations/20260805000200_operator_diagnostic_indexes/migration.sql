CREATE INDEX "AuthEvent_ip_createdAt_idx"
ON "AuthEvent"("ip", "createdAt");

CREATE INDEX "NotificationJob_status_updatedAt_idx"
ON "NotificationJob"("status", "updatedAt");

CREATE INDEX "NotificationJob_failedAt_idx"
ON "NotificationJob"("failedAt");
