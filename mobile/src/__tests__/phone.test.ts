import {
  formatPhoneForDisplay,
  isValidPhoneForCountry,
  normalizePhoneForCountry,
} from '../lib/phone';

describe('isValidPhoneForCountry', () => {
  it('accepts a valid Nigerian local number', () => {
    expect(isValidPhoneForCountry('08012345678', 'NG')).toBe(true);
  });

  it('accepts a valid US local number', () => {
    expect(isValidPhoneForCountry('4155552671', 'US')).toBe(true);
  });

  it('rejects a number that is invalid for the selected country', () => {
    expect(isValidPhoneForCountry('08012345678', 'US')).toBe(false);
  });

  it('rejects an international number for a different selected country', () => {
    expect(isValidPhoneForCountry('+14155552671', 'GB')).toBe(false);
  });

  it('normalizes 00-prefixed international input for the selected country', () => {
    expect(normalizePhoneForCountry('00442071838750', 'GB')).toBe(
      '+442071838750',
    );
  });

  it('rejects 00-prefixed international input for a different selected country', () => {
    expect(normalizePhoneForCountry('00442071838750', 'US')).toBeNull();
  });

  it('normalizes valid input to E.164', () => {
    expect(normalizePhoneForCountry('(415) 555-2671', 'US')).toBe(
      '+14155552671',
    );
  });

  it('formats Nigerian local input for display', () => {
    expect(formatPhoneForDisplay('08012345678', 'NG')).toBe('0801 234 5678');
  });

  it('formats US local input for display with parentheses and dash', () => {
    expect(formatPhoneForDisplay('4155552671', 'US')).toBe('(415) 555-2671');
  });

  it('formats UK local input for display', () => {
    expect(formatPhoneForDisplay('07911123456', 'GB')).toBe('07911 123456');
  });

  it('keeps international input as a compact plus-prefixed display value', () => {
    expect(formatPhoneForDisplay('+1 (415) 555-2671', 'US')).toBe(
      '+14155552671',
    );
  });

  it('normalizes formatted display input', () => {
    expect(normalizePhoneForCountry('(415) 555-2671', 'US')).toBe(
      '+14155552671',
    );
  });

  it('normalizes international 00 prefixes for the selected country', () => {
    expect(normalizePhoneForCountry('00442071838750', 'GB')).toBe(
      '+442071838750',
    );
  });
});
