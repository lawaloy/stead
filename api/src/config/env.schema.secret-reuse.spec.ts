import { envSchema } from './env.schema';

describe('envSchema secret reuse', () => {
  const encryptionKey = 'a-notification-encryption-key-with-32-chars';
  const deviceSecret = 'a-device-identifier-secret-with-32-chars';
  const otpVerificationKey = 'an-otp-verification-key-with-32-chars';

  it('rejects a device identifier secret that reuses JWT_SECRET', () => {
    const shared = 'a-shared-secret-value-32-chars!!';
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: shared,
      AUTH_DEVICE_IDENTIFIER_SECRET: shared,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: encryptionKey,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: otpVerificationKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain(
      'JWT_SECRET, AUTH_DEVICE_IDENTIFIER_SECRET, NOTIFICATION_PAYLOAD_ENCRYPTION_KEY, and AUTH_OTP_VERIFICATION_ENCRYPTION_KEY must be distinct',
    );
  });

  it('rejects a device identifier secret that reuses NOTIFICATION_PAYLOAD_ENCRYPTION_KEY', () => {
    const shared = 'a-shared-secret-value-32-chars!!';
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: 'a-secret-with-16-chars',
      AUTH_DEVICE_IDENTIFIER_SECRET: shared,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: shared,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: otpVerificationKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain(
      'JWT_SECRET, AUTH_DEVICE_IDENTIFIER_SECRET, NOTIFICATION_PAYLOAD_ENCRYPTION_KEY, and AUTH_OTP_VERIFICATION_ENCRYPTION_KEY must be distinct',
    );
  });

  it('rejects an OTP verification key that reuses another secret', () => {
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: 'a-secret-with-16-chars',
      AUTH_DEVICE_IDENTIFIER_SECRET: deviceSecret,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: encryptionKey,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: encryptionKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error?.message).toContain('must be distinct');
  });

  it('accepts four distinct application secrets', () => {
    const result = envSchema.validate({
      DATABASE_URL: 'postgresql://stead:stead@localhost:5432/stead',
      JWT_SECRET: 'a-secret-with-16-chars',
      AUTH_DEVICE_IDENTIFIER_SECRET: deviceSecret,
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: encryptionKey,
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: otpVerificationKey,
      SMS_PROVIDER: 'dev',
    });

    expect(result.error).toBeUndefined();
  });
});
