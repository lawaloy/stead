import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';

describe('OTP verification empty envelope IV', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';
  const keyHash = hashOtpVerificationKey(
    '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  );
  const requestHash = hashOtpVerificationRequest(secret, {
    deviceHash: 'device_hash',
  });
  const response = {
    token: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  it('fails closed when a valid envelope has an empty-string iv', () => {
    const envelope = JSON.parse(
      encryptOtpVerificationResponse(secret, keyHash, requestHash, response),
    ) as {
      v: number;
      iv: string;
      tag: string;
      ciphertext: string;
    };
    envelope.iv = '';

    expect(() =>
      decryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        JSON.stringify(envelope),
      ),
    ).toThrow('Unable to decrypt OTP verification response');
  });
});
