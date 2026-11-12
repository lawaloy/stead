import { BadRequestException } from '@nestjs/common';
import { normalizePhoneNumber } from './phone.util';

describe('normalizePhoneNumber 00-prefix country mismatch', () => {
  it('rejects 00-prefixed international numbers for a different selected country', () => {
    expect(() => normalizePhoneNumber('00442071838750', 'NG')).toThrow(
      BadRequestException,
    );
    expect(() => normalizePhoneNumber('00442071838750', 'NG')).toThrow(
      'phone must match the selected country',
    );
  });
});
