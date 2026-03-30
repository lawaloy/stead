export const authCountries = [
  { iso: 'NG', label: 'Nigeria', dialCode: '+234', placeholder: '08012345678' },
  { iso: 'US', label: 'United States', dialCode: '+1', placeholder: '4155552671' },
  { iso: 'GB', label: 'United Kingdom', dialCode: '+44', placeholder: '07911123456' },
] as const;

export type AuthCountryIso = (typeof authCountries)[number]['iso'];

export const defaultAuthCountryIso: AuthCountryIso = 'NG';

export const getAuthCountry = (iso: AuthCountryIso) =>
  authCountries.find((country) => country.iso === iso) || authCountries[0];
