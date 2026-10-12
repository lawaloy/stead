import { isValidPhoneForCountry, normalizePhoneForCountry } from '../lib/phone';

describe('Nigerian national phone without a trunk 0', () => {
  it.each(['8012345678', '801 234 5678'])(
    'normalizes %s to E.164 for NG',
    (phone) => {
      expect(normalizePhoneForCountry(phone, 'NG')).toBe('+2348012345678');
      expect(isValidPhoneForCountry(phone, 'NG')).toBe(true);
    },
  );

  it('treats the same 10-digit national form as a US number when US is selected', () => {
    expect(normalizePhoneForCountry('8012345678', 'US')).toBe('+18012345678');
    expect(isValidPhoneForCountry('8012345678', 'US')).toBe(true);
  });
});
