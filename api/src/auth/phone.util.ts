import { BadRequestException } from '@nestjs/common';

const E164_REGEX = /^\+[1-9]\d{9,14}$/;
const COUNTRY_DIAL_CODES = {
  NG: '234',
  US: '1',
  GB: '44',
} as const;

export type CountryIso = keyof typeof COUNTRY_DIAL_CODES;

export function getCountryDialCode(countryIso: CountryIso): string {
  return COUNTRY_DIAL_CODES[countryIso];
}

export function normalizePhoneNumber(phone: string, countryIso: CountryIso): string {
  const compact = phone.replace(/[\s\-().]/g, '');
  const dialCode = getCountryDialCode(countryIso);

  let normalized = compact;
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('+')) {
    // already international
  } else if (normalized.startsWith(dialCode)) {
    normalized = `+${normalized}`;
  } else if (/^\d+$/.test(normalized)) {
    normalized = normalized.startsWith('0')
      ? `+${dialCode}${normalized.slice(1)}`
      : `+${dialCode}${normalized}`;
  }

  if (!E164_REGEX.test(normalized)) {
    throw new BadRequestException('phone must look like +2348012345678');
  }

  return normalized;
}
