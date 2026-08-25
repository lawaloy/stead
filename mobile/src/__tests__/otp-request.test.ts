import { fallbackAuthCountries } from '../lib/countries';
import {
  buildOtpRequestInput,
  resolveEffectiveCountryIso,
} from '../lib/otp-request';

describe('OTP request input', () => {
  it('keeps the submitted phone and country snapshot stable across later input changes', () => {
    const submittedInput = buildOtpRequestInput(
      '(415) 555-2671',
      'US',
      fallbackAuthCountries,
    );

    const nextInput = buildOtpRequestInput(
      '08012345678',
      'NG',
      fallbackAuthCountries,
    );

    expect(submittedInput).toEqual({
      phone: '+14155552671',
      countryIso: 'US',
    });
    expect(nextInput).toEqual({
      phone: '+2348012345678',
      countryIso: 'NG',
    });
  });

  it('uses the available default when the selected country is stale', () => {
    const nigerianCountries = fallbackAuthCountries.filter(
      (country) => country.iso === 'NG',
    );

    expect(resolveEffectiveCountryIso('US', nigerianCountries)).toBe('NG');
    expect(
      buildOtpRequestInput('08012345678', 'US', nigerianCountries),
    ).toEqual({
      phone: '+2348012345678',
      countryIso: 'NG',
    });
  });

  it('falls back to NG when the country list is empty', () => {
    expect(resolveEffectiveCountryIso('US', [])).toBe('NG');
    expect(buildOtpRequestInput('08012345678', 'US', [])).toEqual({
      phone: '+2348012345678',
      countryIso: 'NG',
    });
  });

  it('returns null when the phone is invalid for the effective country', () => {
    expect(
      buildOtpRequestInput('08012345678', 'US', fallbackAuthCountries),
    ).toBeNull();
  });

  it('builds a valid request from the offline fallback countries', () => {
    expect(
      buildOtpRequestInput('02071838750', 'GB', fallbackAuthCountries),
    ).toEqual({
      phone: '+442071838750',
      countryIso: 'GB',
    });
  });
});
