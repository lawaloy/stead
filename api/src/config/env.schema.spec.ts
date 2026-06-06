import { envSchema } from './env.schema';

const baseEnv = {
  DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
  JWT_SECRET: 'super-secret-jwt',
};

describe('envSchema', () => {
  it('accepts the dev SMS provider without third-party SMS credentials', () => {
    const { error, value } = envSchema.validate({
      ...baseEnv,
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });
  });

  it('still requires Termii credentials when Termii is active', () => {
    const { error } = envSchema.validate({
      ...baseEnv,
      SMS_PROVIDER: 'termii',
    });

    expect(error?.message).toContain(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });
});
