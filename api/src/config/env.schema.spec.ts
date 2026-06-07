import { envSchema } from './env.schema';

describe('envSchema', () => {
  const baseEnv = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: '0123456789abcdef',
  };

  it('accepts the dev SMS provider without third-party SMS credentials', () => {
    const result = envSchema.validate({
      ...baseEnv,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'false',
    });
  });

  it('continues to require Twilio credentials for the Twilio provider', () => {
    const result = envSchema.validate(
      {
        ...baseEnv,
        SMS_PROVIDER: 'twilio',
      },
      { abortEarly: false },
    );

    expect(result.error?.message).toContain(
      'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
    );
  });
});
