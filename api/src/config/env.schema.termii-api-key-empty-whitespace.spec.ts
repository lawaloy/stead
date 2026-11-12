import { envSchema } from './env.schema';

describe('envSchema empty vs whitespace Termii API key', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'termii',
    TERMII_SENDER_ID: 'Stead',
  };

  it('rejects an empty TERMII_API_KEY and accepts a whitespace-only key at boot', () => {
    const empty = envSchema.validate({
      ...requiredEnv,
      TERMII_API_KEY: '',
    });

    expect(empty.error?.message).toContain(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      TERMII_API_KEY: ' \t\n ',
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: ' \t\n ',
      TERMII_SENDER_ID: 'Stead',
    });
  });
});
