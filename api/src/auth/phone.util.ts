import { BadRequestException } from '@nestjs/common';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
export type CountryIso = 'NG' | 'US' | 'GB';

export function normalizePhoneNumber(
  phone: string,
  countryIso: CountryIso,
): string {
  const compact = phone.replace(/[\s\-().]/g, '');
  const candidate = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, countryIso as CountryCode);

  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException('phone must look like +2348012345678');
  }

  return parsed.number;
}
