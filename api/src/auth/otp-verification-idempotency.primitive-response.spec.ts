import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';
import type { VerifyOtpResponse } from '../contracts/generated/types.gen';

describe('OTP verification primitive decrypted session', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });

  it.each([1, true, 'access-token'] as const)(
    'fails closed when decrypted plaintext is JSON primitive %p',
    (invalid) => {
      const encrypted = encryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        invalid as unknown as VerifyOtpResponse,
      );

      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
      ).toThrow('Unable to decrypt OTP verification response');
    },
  );
});
