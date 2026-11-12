import { envSchema } from './env.schema';

describe('envSchema boot validation', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
    JWT_SECRET: 'a-secret-with-16-chars',
    AUTH_DEVICE_IDENTIFIER_SECRET: 'a-device-identifier-secret-with-32-chars',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'a-notification-encryption-key-with-32-chars',
    AUTH_OTP_VERIFICATION_ENCRYPTION_KEY:
      'an-otp-verification-key-with-32-chars',
    SMS_PROVIDER: 'dev',
  };

  it('requires TWILIO_AUTH_TOKEN when Twilio already has an account SID', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_FROM: '+15551234567',
    });

    expect(result.error?.message).toContain(
      'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
    );
  });

  it('rejects an empty TWILIO_AUTH_TOKEN even when other Twilio credentials are set', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_FROM: '+15551234567',
    });

    expect(result.error?.message).toContain(
      'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
    );
  });

  it('rejects a missing or non-URI DATABASE_URL before the process starts', () => {
    const missing = envSchema.validate({
      ...requiredEnv,
      DATABASE_URL: undefined,
    });
    const invalid = envSchema.validate({
      ...requiredEnv,
      DATABASE_URL: 'not-a-uri',
    });

    expect(missing.error?.message).toContain('DATABASE_URL');
    expect(invalid.error?.message).toContain('DATABASE_URL');
  });

  it.each([65536, -1, 'abc'])('rejects PORT %p as a non-port value', (port) => {
    const { error } = envSchema.validate({
      ...requiredEnv,
      PORT: port,
    });

    expect(error?.message).toContain('PORT');
  });

  it.each(['prod', 'staging', 'local'])(
    'rejects unsupported NODE_ENV %p',
    (nodeEnv) => {
      const { error } = envSchema.validate({
        ...requiredEnv,
        NODE_ENV: nodeEnv,
      });

      expect(error?.message).toContain('NODE_ENV');
    },
  );

  it('rejects an unknown SMS_PROVIDER before provider credentials are checked', () => {
    const { error } = envSchema.validate({
      ...requiredEnv,
      SMS_PROVIDER: 'sns',
    });

    expect(error?.message).toContain('SMS_PROVIDER');
  });

  it.each([0, -1, 1.5])(
    'rejects AUTH_REFRESH_MAX_FAMILIES_PER_USER %p at boot',
    (maxFamilies) => {
      const { error } = envSchema.validate({
        ...requiredEnv,
        AUTH_REFRESH_MAX_FAMILIES_PER_USER: maxFamilies,
      });

      expect(error?.message).toContain('AUTH_REFRESH_MAX_FAMILIES_PER_USER');
    },
  );

  it('accepts the minimum refresh family cap of 1', () => {
    const result = envSchema.validate({
      ...requiredEnv,
      AUTH_REFRESH_MAX_FAMILIES_PER_USER: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      AUTH_REFRESH_MAX_FAMILIES_PER_USER: 1,
    });
  });
});
