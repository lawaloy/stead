import { envSchema } from './env.schema';
import type { ValidationResult } from 'joi';

const baseEnv = {
  DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
  JWT_SECRET: 'super-secret-jwt',
};

describe('envSchema', () => {
  it('accepts the dev SMS provider without third-party SMS credentials', () => {
    const result = envSchema.validate({
      ...baseEnv,
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    }) as ValidationResult<Record<string, unknown>>;

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });
  });

  it('still requires Termii credentials when Termii is active', () => {
    const result = envSchema.validate({
      ...baseEnv,
      SMS_PROVIDER: 'termii',
    }) as ValidationResult<Record<string, unknown>>;

    expect(result.error?.message).toContain(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });
});
