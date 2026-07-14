import { AuthCountry } from '../types/api';

export const fallbackAuthCountries: AuthCountry[] = [
  {
    iso: 'NG',
    label: 'Nigeria',
    dialCode: '+234',
    currencyCode: 'NGN',
    phoneExample: '08012345678',
    authEnabled: true,
    marketEnabled: true,
    defaultCountry: true,
  },
  {
    iso: 'US',
    label: 'United States',
    dialCode: '+1',
    currencyCode: 'USD',
    phoneExample: '4155552671',
    authEnabled: true,
    marketEnabled: false,
    defaultCountry: false,
  },
  {
    iso: 'GB',
    label: 'United Kingdom',
    dialCode: '+44',
    currencyCode: 'GBP',
    phoneExample: '07911123456',
    authEnabled: true,
    marketEnabled: false,
    defaultCountry: false,
  },
];

export type AuthCountryIso = string;

export const defaultAuthCountryIso: AuthCountryIso = 'NG';

export const getDefaultAuthCountry = (countries = fallbackAuthCountries) =>
  countries.find((country) => country.defaultCountry) || countries[0];

export const getAuthCountry = (
  iso: AuthCountryIso,
  countries = fallbackAuthCountries,
) =>
  countries.find((country) => country.iso === iso) ||
  getDefaultAuthCountry(countries);

export const withDisplayPhoneExamples = (countries: AuthCountry[]) =>
  countries.map((country) => ({
    ...country,
    phoneExample:
      country.iso === 'US'
        ? '(415) 555-2671'
        : country.iso === 'GB'
          ? '07911 123456'
          : '0801 234 5678',
  }));
