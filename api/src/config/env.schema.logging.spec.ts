import { envSchema } from './env.schema';

const baseEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/stead',
  JWT_SECRET: 'jwt-secret-value-long-enough',
  AUTH_DEVICE_IDENTIFIER_SECRET: 'device-secret-value-at-least-32-characters',
  NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
    'notification-secret-value-at-least-32-characters',
  AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
    'otp-verification-secret-value-at-least-32-characters',
  SMS_PROVIDER: 'dev',
};

describe('logging environment', () => {
  it('defaults to JSON info logs', () => {
    const result = envSchema.validate(baseEnvironment);

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      LOG_FORMAT: 'json',
      LOG_LEVEL: 'info',
    });
  });

  it.each([
    ['LOG_FORMAT', 'xml'],
    ['LOG_LEVEL', 'trace'],
  ])('rejects unsupported %s values', (name, invalid) => {
    const { error } = envSchema.validate({
      ...baseEnvironment,
      [name]: invalid,
    });

    expect(error?.message).toContain(name);
  });
});
