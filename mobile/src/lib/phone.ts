import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuthCountryIso } from './countries';

const onlyDigits = (phone: string) => phone.replace(/\D/g, '');

const formatNigerianPhone = (digits: string) => {
  const first = digits.slice(0, 4);
  const second = digits.slice(4, 7);
  const third = digits.slice(7, 11);
  return [first, second, third].filter(Boolean).join(' ');
};

const formatUsPhone = (digits: string) => {
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);

  if (digits.length <= 3) return area ? `(${area}` : '';
  if (digits.length <= 6) return `(${area}) ${prefix}`;
  return `(${area}) ${prefix}-${line}`;
};

const formatGbPhone = (digits: string) => {
  const first = digits.slice(0, 5);
  const second = digits.slice(5, 11);
  return [first, second].filter(Boolean).join(' ');
};

export function formatPhoneForDisplay(
  phone: string,
  countryIso: AuthCountryIso,
): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return `+${onlyDigits(trimmed).slice(0, 15)}`;

  const digits = onlyDigits(phone);
  if (countryIso === 'US') return formatUsPhone(digits);
  if (countryIso === 'GB') return formatGbPhone(digits);
  return formatNigerianPhone(digits);
}

export function normalizePhoneForCountry(
  phone: string,
  countryIso: AuthCountryIso,
): string | null {
  const compact = phone.replace(/[\s\-().]/g, '');
  const candidate = compact.startsWith('00')
    ? `+${compact.slice(2)}`
    : compact;
  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, countryIso as CountryCode);

  if (!parsed || !parsed.isValid() || parsed.country !== countryIso) {
    return null;
  }

  return parsed.number;
}

export function isValidPhoneForCountry(
  phone: string,
  countryIso: AuthCountryIso,
): boolean {
  return normalizePhoneForCountry(phone, countryIso) !== null;
}
