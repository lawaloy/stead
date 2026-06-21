import { resolveOtpToSubmit } from '../lib/otp';

describe('resolveOtpToSubmit', () => {
  it('uses the typed otp when provided', () => {
    expect(resolveOtpToSubmit('123456', '654321')).toBe('123456');
  });

  it('falls back to the dev otp hint when the visible input has not changed', () => {
    expect(resolveOtpToSubmit('', '654321')).toBe('654321');
  });
});
