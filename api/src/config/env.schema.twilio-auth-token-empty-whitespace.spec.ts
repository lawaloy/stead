import { envSchema } from './env.schema';

describe('envSchema empty vs whitespace Twilio AUTH_TOKEN', () => {
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
    TWILIO_FROM: '+15551234567',
  };

  it('rejects an empty TWILIO_AUTH_TOKEN and accepts a whitespace-only token at boot', () => {
    const empty = envSchema.validate({
      ...requiredEnv,
      TWILIO_AUTH_TOKEN: '',
    });

    expect(empty.error?.message).toContain(
      'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      TWILIO_AUTH_TOKEN: ' \t\n ',
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'twilio',
      TWILIO_AUTH_TOKEN: ' \t\n ',
    });
  });
});
