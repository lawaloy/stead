import {
  fallbackAuthCountries,
  getAuthCountry,
  getDefaultAuthCountry,
  withDisplayPhoneExamples,
} from '../lib/countries';

describe('auth countries', () => {
  it('falls back to Nigeria as the default country', () => {
    expect(getDefaultAuthCountry(fallbackAuthCountries)).toMatchObject({
      iso: 'NG',
      label: 'Nigeria',
      defaultCountry: true,
      marketEnabled: true,
    });
  });

  it('keeps every seeded auth country available when the API is unavailable', () => {
    expect(fallbackAuthCountries.map((country) => country.iso)).toEqual([
      'NG',
      'US',
      'GB',
    ]);
    expect(fallbackAuthCountries.every((country) => country.authEnabled)).toBe(
      true,
    );
  });

  it('uses the default country when a selected country is missing', () => {
    expect(getAuthCountry('ZZ', fallbackAuthCountries).iso).toBe('NG');
  });

  it('uses formatted display phone examples', () => {
    expect(
      withDisplayPhoneExamples([
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
      ])[0].phoneExample,
    ).toBe('(415) 555-2671');
  });
});
