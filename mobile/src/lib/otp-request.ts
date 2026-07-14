import { AuthCountry } from '../types/api';
import {
  AuthCountryIso,
  defaultAuthCountryIso,
  getDefaultAuthCountry,
} from './countries';
import { normalizePhoneForCountry } from './phone';

export type OtpRequestInput = {
  phone: string;
  countryIso: AuthCountryIso;
};

export function resolveEffectiveCountryIso(
  selectedCountryIso: AuthCountryIso,
  countries: AuthCountry[],
): AuthCountryIso {
  if (countries.some((country) => country.iso === selectedCountryIso)) {
    return selectedCountryIso;
  }

  return getDefaultAuthCountry(countries)?.iso ?? defaultAuthCountryIso;
}

export function buildOtpRequestInput(
  phone: string,
  selectedCountryIso: AuthCountryIso,
  countries: AuthCountry[],
): OtpRequestInput | null {
  const countryIso = resolveEffectiveCountryIso(
    selectedCountryIso,
    countries,
  );
  const normalizedPhone = normalizePhoneForCountry(phone, countryIso);

  return normalizedPhone === null
    ? null
    : { phone: normalizedPhone, countryIso };
}
