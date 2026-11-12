import { envSchema } from './env.schema';

describe('envSchema empty vs whitespace Twilio From without Messaging SID', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    TWILIO_AUTH_TOKEN: 'twilio_auth_token',
  };

  it('rejects an empty TWILIO_FROM and accepts a whitespace-only From when Messaging SID is omitted', () => {
    const empty = envSchema.validate({
      ...requiredEnv,
      TWILIO_FROM: '',
    });

    expect(empty.error?.message).toContain(
      'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      TWILIO_FROM: ' \t\n ',
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'twilio',
      TWILIO_FROM: ' \t\n ',
    });
    expect(
      (whitespace.value as Record<string, unknown>)
        .TWILIO_MESSAGING_SERVICE_SID,
    ).toBeUndefined();
  });
});
