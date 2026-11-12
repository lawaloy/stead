import { envSchema } from './env.schema';

describe('envSchema empty vs whitespace Termii sender id', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'termii',
    TERMII_API_KEY: 'termii_api_key',
  };

  it('rejects an empty TERMII_SENDER_ID and accepts a whitespace-only sender at boot', () => {
    const empty = envSchema.validate({
      ...requiredEnv,
      TERMII_SENDER_ID: '',
    });

    expect(empty.error?.message).toContain(
      'TERMII_SENDER_ID is required when SMS_PROVIDER=termii',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      TERMII_SENDER_ID: ' \t\n ',
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii_api_key',
      TERMII_SENDER_ID: ' \t\n ',
    });
  });
});
