import { envSchema } from './env.schema';

describe('envSchema empty vs min-length whitespace JWT_SECRET', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'dev',
  };
  const whitespaceSecret = ' \t\n '.repeat(4);

  it('rejects an empty JWT_SECRET and accepts a 16-character whitespace-only secret at boot', () => {
    expect(whitespaceSecret).toHaveLength(16);

    const empty = envSchema.validate({
      ...requiredEnv,
      JWT_SECRET: '',
    });

    expect(empty.error?.message).toContain('JWT_SECRET');

    const whitespace = envSchema.validate({
      ...requiredEnv,
      JWT_SECRET: whitespaceSecret,
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      JWT_SECRET: whitespaceSecret,
      SMS_PROVIDER: 'dev',
    });
  });
});
