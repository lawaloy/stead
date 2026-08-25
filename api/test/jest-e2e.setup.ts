const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://stead:stead@localhost:5432/stead?schema=e2e';
const e2eSchema = new URL(e2eDatabaseUrl).searchParams.get('schema');

if (!e2eSchema || !/^(?:e2e|test)(?:_|$)/.test(e2eSchema)) {
  throw new Error(
    'E2E tests require DATABASE_URL or E2E_DATABASE_URL to use a dedicated e2e/test schema',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stead-test-secret-12345';
process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY =
  process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ||
  'stead-test-notification-key-1234567890';
process.env.AUTH_DEVICE_IDENTIFIER_SECRET =
  process.env.AUTH_DEVICE_IDENTIFIER_SECRET ||
  'stead-test-device-identifier-key-1234567890';
process.env.AUTH_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR =
  process.env.AUTH_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR || '2';
process.env.AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW =
  process.env.AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW || '2';
process.env.AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR =
  process.env.AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR || '8';
process.env.AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW =
  process.env.AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW || '4';
process.env.AUTH_INSPECTION_OPERATOR_USER_IDS =
  process.env.AUTH_INSPECTION_OPERATOR_USER_IDS || 'operator-e2e';
process.env.SMS_PROVIDER = process.env.SMS_PROVIDER || 'dev';
process.env.DEV_EXPOSE_OTP = process.env.DEV_EXPOSE_OTP || 'true';
