import { envSchema } from './env.schema';

describe('envSchema', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
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
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
        requiredEnv.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain('JWT_SECRET');
  });

  it('rejects notification encryption keys shorter than 32 characters', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: 'too-short',
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain(
      'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY',
    );
  });

  it('rejects otp abuse-control env values below their minimums', () => {
    const result = envSchema.validate(
      {
        ...requiredEnv,
        SMS_PROVIDER: 'dev',
        AUTH_OTP_REQUEST_LIMIT_PER_HOUR: 0,
        AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR: 0,
        AUTH_OTP_MAX_VERIFY_ATTEMPTS: 0,
        AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW: 0,
        AUTH_OTP_RESEND_COOLDOWN_MS: 500,
        AUTH_OTP_VERIFY_FAILURE_WINDOW_MS: 500,
      },
      { abortEarly: false },
    );

    const details = result.error?.details.map((detail) => detail.message) ?? [];
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_REQUEST_LIMIT_PER_HOUR'),
      ),
    ).toBe(true);
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR'),
      ),
    ).toBe(true);
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_MAX_VERIFY_ATTEMPTS'),
      ),
    ).toBe(true);
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW'),
      ),
    ).toBe(true);
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_RESEND_COOLDOWN_MS'),
      ),
    ).toBe(true);
    expect(
      details.some((message) =>
        message.includes('AUTH_OTP_VERIFY_FAILURE_WINDOW_MS'),
      ),
    ).toBe(true);
  });
});
