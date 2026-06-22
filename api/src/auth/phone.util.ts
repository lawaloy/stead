import { BadRequestException } from '@nestjs/common';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
export type CountryIso = CountryCode;

export function normalizePhoneNumber(
  phone: string,
  countryIso: CountryIso,
): string {
  const compact = phone.replace(/[\s\-().]/g, '');
  const candidate = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, countryIso);

  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException('phone must look like +2348012345678');
  }

  if (parsed.country !== countryIso) {
    throw new BadRequestException('phone must match the selected country');
  }

  return parsed.number;
}
