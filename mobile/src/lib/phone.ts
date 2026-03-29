import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuthCountryIso } from './countries';

export function isValidPhoneForCountry(
  phone: string,
  countryIso: AuthCountryIso,
): boolean {
  const compact = phone.replace(/[\s\-().]/g, '');
  const candidate = compact.startsWith('00')
    ? `+${compact.slice(2)}`
    : compact;
  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, countryIso as CountryCode);

  return !!parsed && parsed.isValid();
}
