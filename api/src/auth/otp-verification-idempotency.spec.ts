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

  it('fails closed when the encryption secret does not match', () => {
    const encrypted = encryptOtpVerificationResponse(
      secret,
      keyHash,
      requestHash,
      response,
    );

    expect(() =>
      decryptOtpVerificationResponse(
        'a-different-otp-verification-secret-32ch',
        keyHash,
        requestHash,
        encrypted,
      ),
    ).toThrow('Unable to decrypt OTP verification response');
  });

  it('fails closed for a malformed envelope or non-JSON wrapper', () => {
    for (const invalid of [
      'not-json',
      '{}',
      'null',
      JSON.stringify({
        v: 2,
        iv: 'AAAAAAAAAAAAAAAA',
        tag: 'AAAAAAAAAAAAAAAAAAAAAA',
        ciphertext: 'AAAA',
      }),
      JSON.stringify({
        v: 1,
        iv: 12,
        tag: 'AAAAAAAAAAAAAAAAAAAAAA',
        ciphertext: 'AAAA',
      }),
    ]) {
      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, invalid),
      ).toThrow('Unable to decrypt OTP verification response');
    }
  });

  it('fails closed when decrypted JSON is not a usable session', () => {
    for (const invalid of [
      { token: 'access-token', refreshToken: 'refresh-token', expiresIn: 0 },
      { token: 'access-token', refreshToken: 'refresh-token', expiresIn: 1.5 },
      { token: 'access-token', expiresIn: 900 },
    ]) {
      const encrypted = encryptOtpVerificationResponse(
        secret,
        keyHash,
        requestHash,
        invalid as typeof response,
      );

      expect(() =>
        decryptOtpVerificationResponse(secret, keyHash, requestHash, encrypted),
      ).toThrow('Unable to decrypt OTP verification response');
    }
  });
});
