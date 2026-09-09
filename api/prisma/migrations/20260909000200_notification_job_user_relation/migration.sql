-- AddForeignKey
ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
