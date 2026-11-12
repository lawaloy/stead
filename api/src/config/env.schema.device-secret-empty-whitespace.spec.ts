import { envSchema } from './env.schema';

describe('envSchema empty vs min-length whitespace device identifier secret', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'dev',
  };
  const whitespaceSecret = ' \t\n '.repeat(8);

  it('rejects an empty AUTH_DEVICE_IDENTIFIER_SECRET and accepts a 32-character whitespace-only secret at boot', () => {
    expect(whitespaceSecret).toHaveLength(32);

    const empty = envSchema.validate({
      ...requiredEnv,
      AUTH_DEVICE_IDENTIFIER_SECRET: '',
    });

    expect(empty.error?.message).toContain('AUTH_DEVICE_IDENTIFIER_SECRET');

    const whitespace = envSchema.validate({
      ...requiredEnv,
      AUTH_DEVICE_IDENTIFIER_SECRET: whitespaceSecret,
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      AUTH_DEVICE_IDENTIFIER_SECRET: whitespaceSecret,
      SMS_PROVIDER: 'dev',
    });
  });
});
