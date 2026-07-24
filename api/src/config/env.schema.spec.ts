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

  it('continues to require Twilio credentials for the Twilio provider', () => {
    const result = envSchema.validate(
      {
        ...requiredEnv,
        SMS_PROVIDER: 'twilio',
      },
      { abortEarly: false },
    );

    expect(result.error?.message).toContain(
      'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
    );
  });

  it('preserves explicit dev OTP exposure configuration', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });
  });

  it('rejects the dev SMS provider in production', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain(
      'SMS_PROVIDER=dev is not allowed when NODE_ENV=production',
    );
  });

  it('rejects dev OTP exposure in production', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'twilio',
      DEV_EXPOSE_OTP: 'true',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio_auth_token',
      TWILIO_FROM: '+15551234567',
    });

    expect(result.error?.message).toContain(
      'DEV_EXPOSE_OTP=true is not allowed when NODE_ENV=production',
    );
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

  it('allows Twilio when MessagingServiceSid is set without From', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio_auth_token',
      TWILIO_MESSAGING_SERVICE_SID: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });

    expect(result.error).toBeUndefined();
  });

  it('rejects Twilio when neither From nor MessagingServiceSid is configured', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio_auth_token',
    });

    expect(result.error?.message).toContain(
      'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
    );
  });

  it('requires Termii sender id when the Termii provider is active', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii_api_key',
    });

    expect(result.error?.message).toContain(
      'TERMII_SENDER_ID is required when SMS_PROVIDER=termii',
    );
  });

  it('rejects JWT secrets shorter than 16 characters', () => {
    const result = envSchema.validate({
      DATABASE_URL: requiredEnv.DATABASE_URL,
      JWT_SECRET: 'too-short',
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain('JWT_SECRET');
  });
});
