import { BadRequestException } from '@nestjs/common';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
const COUNTRY_DIAL_CODES = {
  NG: '234',
  US: '1',
  GB: '44',
} as const;

export type CountryIso = keyof typeof COUNTRY_DIAL_CODES;

export function normalizePhoneNumber(phone: string, countryIso: CountryIso): string {
  const compact = phone.replace(/[\s\-().]/g, '');
  const candidate = compact.startsWith('00')
    ? `+${compact.slice(2)}`
    : compact;
  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, countryIso as CountryCode);

  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException('phone must look like +2348012345678');
  }

  return parsed.number;
}
