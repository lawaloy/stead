import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';
import type { VerifyOtpResponse } from '../contracts/generated/types.gen';

describe('OTP verification null decrypted session', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });

  it('fails closed when decrypted plaintext is JSON null or an array', () => {
    for (const invalid of [null, []]) {
      const encrypted = encryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        invalid as unknown as VerifyOtpResponse,
      );

      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
      ).toThrow('Unable to decrypt OTP verification response');
    }
  });
});
