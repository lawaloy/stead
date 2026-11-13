import {
  hashOtpVerificationRequest,
  otpVerificationRequestMatches,
} from './otp-verification-idempotency';

describe('OTP verification empty device fingerprint', () => {
  const secret = 'otp-verification-test-secret-at-least-32-characters';

  it('treats an empty-string device hash as distinct from a missing fingerprint', () => {
    const unbound = hashOtpVerificationRequest(secret, { deviceHash: null });
    const omitted = hashOtpVerificationRequest(secret, {});
    const empty = hashOtpVerificationRequest(secret, { deviceHash: '' });

    expect(otpVerificationRequestMatches(unbound, omitted)).toBe(true);
    expect(otpVerificationRequestMatches(unbound, empty)).toBe(false);
    expect(otpVerificationRequestMatches(omitted, empty)).toBe(false);
    expect(otpVerificationRequestMatches(empty, empty)).toBe(true);
  });
});
