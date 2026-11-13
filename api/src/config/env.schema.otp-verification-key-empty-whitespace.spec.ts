import { envSchema } from './env.schema';

describe('envSchema empty vs min-length whitespace OTP verification key', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    SMS_PROVIDER: 'dev',
  };
  const whitespaceSecret = ' \t\n '.repeat(8);

  it('rejects an empty AUTH_OTP_VERIFICATION_ENCRYPTION_KEY and accepts a 32-character whitespace-only key at boot', () => {
    expect(whitespaceSecret).toHaveLength(32);

    const empty = envSchema.validate({
      ...requiredEnv,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: '',
    });

    expect(empty.error?.message).toContain(
      'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY',
    );

    const whitespace = envSchema.validate({
      ...requiredEnv,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: whitespaceSecret,
    });

    expect(whitespace.error).toBeUndefined();
    expect(whitespace.value as Record<string, unknown>).toMatchObject({
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: whitespaceSecret,
      SMS_PROVIDER: 'dev',
    });
  });
});
