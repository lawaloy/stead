import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';

describe('OTP verification decrypted token shape', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });

  it.each([
    {
      token: 123,
      refreshToken: 'refresh-token',
      expiresIn: 900,
    },
    {
      token: true,
      refreshToken: 'refresh-token',
      expiresIn: 900,
    },
    {
      token: ['access-token'],
      refreshToken: 'refresh-token',
      expiresIn: 900,
    },
    {
      token: 'access-token',
      refreshToken: 456,
      expiresIn: 900,
    },
    {
      token: 'access-token',
      refreshToken: false,
      expiresIn: 900,
    },
  ])(
    'fails closed when token or refreshToken is not a string (%p)',
    (invalid) => {
      const encrypted = encryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        invalid as never,
      );

      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
      ).toThrow('Unable to decrypt OTP verification response');
    },
  );
});
