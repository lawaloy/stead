-- Preserve legacy rows for runtime adoption, but prevent an older application
-- instance from inserting another deliverable OTP job without its durable link.
ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_otp_requested_linked"
CHECK (
  "type" <> 'otp.requested'
  OR ("otpCodeId" IS NOT NULL AND "dedupeKey" IS NOT NULL)
) NOT VALID;
