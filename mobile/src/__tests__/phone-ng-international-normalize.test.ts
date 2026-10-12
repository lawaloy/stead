import {
  formatPhoneForDisplay,
  isValidPhoneForCountry,
  normalizePhoneForCountry,
} from '../lib/phone';

describe('Nigerian international phone normalization', () => {
  it.each(['+2348012345678', '+234 801 234 5678', '002348012345678'])(
    'normalizes %s to E.164 for NG',
    (phone) => {
      expect(normalizePhoneForCountry(phone, 'NG')).toBe('+2348012345678');
      expect(isValidPhoneForCountry(phone, 'NG')).toBe(true);
    },
  );

  it('rejects a Nigerian E.164 number when a different country is selected', () => {
    expect(normalizePhoneForCountry('+2348012345678', 'US')).toBeNull();
    expect(isValidPhoneForCountry('+2348012345678', 'US')).toBe(false);
  });

  it('keeps explicit Nigerian international input as a compact plus-prefixed display value', () => {
    expect(formatPhoneForDisplay('+234 801 234 5678', 'NG')).toBe(
      '+2348012345678',
    );
  });
});
