import { isValidPhoneForCountry } from '../lib/phone';

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
});
