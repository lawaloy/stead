import { envSchema } from './env.schema';

describe('envSchema empty vs whitespace Twilio Messaging SID without From', () => {
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

  it('rejects an empty TWILIO_MESSAGING_SERVICE_SID and accepts a whitespace-only SID when From is omitted', () => {
    const empty = envSchema.validate({
      ...requiredEnv,
      TWILIO_MESSAGING_SERVICE_SID: '',
    });

    expect(empty.error?.message).toContain(
      'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      TWILIO_MESSAGING_SERVICE_SID: ' \t\n ',
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'twilio',
      TWILIO_MESSAGING_SERVICE_SID: ' \t\n ',
    });
    expect(
      (whitespace.value as Record<string, unknown>).TWILIO_FROM,
    ).toBeUndefined();
  });
});
