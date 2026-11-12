import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';
import type { VerifyOtpResponse } from '../contracts/generated/types.gen';

describe('OTP verification negative and max-safe expiresIn', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });

  const encrypt = (response: VerifyOtpResponse) =>
    encryptOtpVerificationResponse(secret, keyHash, requestHash, response);

  it('round-trips the largest safe integer lifetime', () => {
    const response = {
      token: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: Number.MAX_SAFE_INTEGER,
    };

    expect(
      decryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        encrypt(response),
      ),
    ).toEqual(response);
  });

  it('fails closed for a negative lifetime', () => {
    const encrypted = encrypt({
      token: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: -1,
    });

    expect(() =>
      decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
    ).toThrow('Unable to decrypt OTP verification response');
  });
});
