import { isValidOtp, resolveOtpToSubmit } from '../lib/otp';

describe('resolveOtpToSubmit', () => {
  it('uses the typed otp when provided', () => {
    expect(resolveOtpToSubmit('123456', '654321')).toBe('123456');
  });

  it('falls back to the dev otp hint when the visible input has not changed', () => {
    expect(resolveOtpToSubmit('', '654321')).toBe('654321');
  });

  it('treats whitespace-only typed otp as empty and uses the trimmed hint', () => {
    expect(resolveOtpToSubmit('   ', ' 654321 ')).toBe('654321');
  });

  it('trims a typed otp before preferring it over the hint', () => {
    expect(resolveOtpToSubmit(' 123456 ', '654321')).toBe('123456');
  });
});

describe('isValidOtp', () => {
  it('accepts exactly six digits', () => {
    expect(isValidOtp('123456')).toBe(true);
  });

  it.each(['', '12345', '1234567', '12345a', '      '])('rejects %p', (otp) => {
    expect(isValidOtp(otp)).toBe(false);
  });
});
