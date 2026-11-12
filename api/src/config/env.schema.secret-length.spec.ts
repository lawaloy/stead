import { envSchema } from './env.schema';

describe('envSchema secret length bounds', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-32chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: 'a-notification-encryption-key-32ch',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: 'an-otp-verification-key-32-chars!!',
    SMS_PROVIDER: 'dev',
  };

  it('rejects a device identifier secret shorter than 32 characters', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      AUTH_DEVICE_IDENTIFIER_SECRET: 'x'.repeat(31),
    });

    expect(result.error?.message).toContain('AUTH_DEVICE_IDENTIFIER_SECRET');
  });

  it('rejects an OTP verification encryption key shorter than 32 characters', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: 'y'.repeat(31),
    });

    expect(result.error?.message).toContain(
      'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY',
    );
  });

  it('accepts distinct 32-character device and OTP verification secrets', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      AUTH_DEVICE_IDENTIFIER_SECRET: 'd'.repeat(32),
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: 'o'.repeat(32),
    });

    expect(result.error).toBeUndefined();
  });
});
