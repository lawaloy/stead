import { envSchema } from './env.schema';

describe('envSchema secret reuse', () => {
  const encryptionKey = 'a-notification-encryption-key-with-32-chars';
  const deviceSecret = 'a-device-identifier-secret-with-32-chars';

  it('rejects a device identifier secret that reuses JWT_SECRET', () => {
    const shared = 'a-shared-secret-value-32-chars!!';
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: shared,
      AUTH_DEVICE_IDENTIFIER_SECRET: shared,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: encryptionKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain(
      'AUTH_DEVICE_IDENTIFIER_SECRET must not reuse JWT_SECRET or NOTIFICATION_PAYLOAD_ENCRYPTION_KEY',
    );
  });

  it('accepts distinct jwt, device, and notification encryption secrets', () => {
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: 'a-secret-with-16-chars',
      AUTH_DEVICE_IDENTIFIER_SECRET: deviceSecret,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: encryptionKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error).toBeUndefined();
  });
});
