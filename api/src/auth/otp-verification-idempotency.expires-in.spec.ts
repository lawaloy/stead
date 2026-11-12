import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';

describe('OTP verification expiresIn fail-closed', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });

  it('fails closed when decrypted expiresIn is a numeric string, boolean, or unsafe integer', () => {
    for (const invalid of [
      {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: '900',
      },
      {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: true,
      },
      {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: Number.MAX_SAFE_INTEGER + 1,
      },
    ]) {
      const encrypted = encryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        invalid as {
          token: string;
          refreshToken: string;
          expiresIn: number;
        },
      );

      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
      ).toThrow('Unable to decrypt OTP verification response');
    }
  });
});
