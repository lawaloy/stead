import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
  otpVerificationRequestMatches,
} from './otp-verification-idempotency';

describe('OTP verification idempotency crypto', () => {
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

  it('round-trips an authenticated encrypted response without plaintext tokens', () => {
    const encrypted = encryptOtpVerificationResponse(
      secret,
      keyHash,
      requestHash,
      response,
    );

    expect(encrypted).not.toContain(response.token);
    expect(encrypted).not.toContain(response.refreshToken);
    expect(
      decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
    ).toEqual(response);
  });

  it('binds ciphertext to both the key and request fingerprints', () => {
    const encrypted = encryptOtpVerificationResponse(
      secret,
      keyHash,
      requestHash,
      response,
    );

    expect(() =>
      decryptOtpVerificationResponse(
        secret,
        hashOtpVerificationKey('00000000-0000-4000-8000-000000000001'),
        requestHash,
        encrypted,
      ),
    ).toThrow('Unable to decrypt OTP verification response');
    expect(() =>
      decryptOtpVerificationResponse(
        secret,
        keyHash,
        '0'.repeat(64),
        encrypted,
      ),
    ).toThrow('Unable to decrypt OTP verification response');
  });

  it('uses a keyed context fingerprint and constant-time comparison', () => {
    expect(requestHash).not.toContain('device_hash');
    expect(otpVerificationRequestMatches(requestHash, requestHash)).toBe(true);
    expect(otpVerificationRequestMatches(requestHash, '0'.repeat(64))).toBe(
      false,
    );
  });
});
