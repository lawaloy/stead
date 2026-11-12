import { envSchema } from './env.schema';

describe('envSchema SMS provider credentials', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
  };

  it('defaults an omitted SMS_PROVIDER to Twilio and requires an account SID at boot', () => {
    const result = envSchema.validate(requiredEnv);

    expect(result.error?.message).toContain(
      'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
    );
  });

  it('rejects an empty TWILIO_ACCOUNT_SID even when the auth token and From are set', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: 'twilio_auth_token',
      TWILIO_FROM: '+15551234567',
    });

    expect(result.error?.message).toContain(
      'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
    );
  });

  it('rejects an empty TERMII_API_KEY even when a sender id is set', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: '',
      TERMII_SENDER_ID: 'Stead',
    });

    expect(result.error?.message).toContain(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });

  it('rejects an empty TERMII_SENDER_ID even when an API key is set', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii_api_key',
      TERMII_SENDER_ID: '',
    });

    expect(result.error?.message).toContain(
      'TERMII_SENDER_ID is required when SMS_PROVIDER=termii',
    );
  });

  it('accepts Termii when both API key and sender id are present', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii_api_key',
      TERMII_SENDER_ID: 'Stead',
    });

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      SMS_PROVIDER: 'termii',
    });
  });
});
