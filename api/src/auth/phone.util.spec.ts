import { BadRequestException } from '@nestjs/common';
import { normalizePhoneNumber } from './phone.util';

describe('normalizePhoneNumber', () => {
  it('normalizes a national number with the selected country', () => {
    expect(normalizePhoneNumber('08012345678', 'NG')).toBe('+2348012345678');
  });

  it('removes common phone formatting characters before parsing', () => {
    expect(normalizePhoneNumber('(415) 555-2671', 'US')).toBe('+14155552671');
  });

  it('treats 00-prefixed input as an international number', () => {
    expect(normalizePhoneNumber('00442071838750', 'NG')).toBe('+442071838750');
  });

  it('keeps explicit international numbers independent of selected country', () => {
    expect(normalizePhoneNumber('+1 415 555 2671', 'GB')).toBe('+14155552671');
  });

  it('rejects numbers that cannot be parsed as valid for the country', () => {
    expect(() => normalizePhoneNumber('123456', 'NG')).toThrow(
      BadRequestException,
    );
  });
});
