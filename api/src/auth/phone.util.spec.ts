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
    expect(normalizePhoneNumber('00442071838750', 'GB')).toBe('+442071838750');
  });

  it('normalizes explicit international numbers that match the selected country', () => {
    expect(normalizePhoneNumber('+1 415 555 2671', 'US')).toBe('+14155552671');
  });

  it('rejects explicit international numbers for a different selected country', () => {
    expect(() => normalizePhoneNumber('+1 415 555 2671', 'GB')).toThrow(
      BadRequestException,
    );
    expect(() => normalizePhoneNumber('+1 415 555 2671', 'GB')).toThrow(
      'phone must match the selected country',
    );
  });

  it('rejects numbers that cannot be parsed as valid for the country', () => {
    expect(() => normalizePhoneNumber('123456', 'NG')).toThrow(
      BadRequestException,
    );
    expect(() => normalizePhoneNumber('123456', 'NG')).toThrow(
      'phone must look like +2348012345678',
    );
  });
});
