import { envSchema } from './env.schema';

describe('envSchema', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
  };

  it('allows the dev SMS provider without external SMS credentials', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'false',
    });
  });

  it('still requires Termii credentials when the Termii provider is active', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'termii',
    });

    expect(result.error?.message).toContain(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });
});
