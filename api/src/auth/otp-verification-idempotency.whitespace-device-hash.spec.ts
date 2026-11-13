import {
  hashOtpVerificationRequest,
  otpVerificationRequestMatches,
} from './otp-verification-idempotency';

describe('OTP verification whitespace device-hash fingerprints', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';

  it('keeps whitespace-only device hashes distinct from empty and unbound fingerprints', () => {
    const whitespace = hashOtpVerificationRequest(secret, {
      deviceHash: ' \t\n ',
    });
    const empty = hashOtpVerificationRequest(secret, { deviceHash: '' });
    const unbound = hashOtpVerificationRequest(secret, { deviceHash: null });
    const omitted = hashOtpVerificationRequest(secret, {});

    expect(otpVerificationRequestMatches(whitespace, empty)).toBe(false);
    expect(otpVerificationRequestMatches(whitespace, unbound)).toBe(false);
    expect(otpVerificationRequestMatches(empty, unbound)).toBe(false);
    expect(otpVerificationRequestMatches(unbound, omitted)).toBe(true);
  });
});
