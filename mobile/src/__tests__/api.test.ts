import MockAdapter from 'axios-mock-adapter';
import {
  ApiError,
  apiClient,
  configureApiAuth,
  fetchAuthCountries,
  requestOtp,
  verifyOtp,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

describe('api client', () => {
  const mock = new MockAdapter(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth({
      getToken: async () => null,
      onUnauthorized: () => undefined,
    });
  });

  it('adds Authorization header when token exists', async () => {
    configureApiAuth({
      getToken: async () => 'jwt-token',
      onUnauthorized: () => undefined,
    });

    mock.onPost('/auth/request-otp').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer jwt-token');
      return [200, { ok: true, otp: '123456' }];
    });

    const response = await requestOtp('08012345678', 'NG');
    expect(response.ok).toBe(true);
    expect(response.otp).toBe('123456');
  });

  it('calls unauthorized handler on 401', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => null,
      onUnauthorized,
    });

    mock.onPost('/auth/verify-otp').reply(401, { message: 'Unauthorized' });

    await expect(
      verifyOtp('08012345678', 'NG', '000000'),
    ).rejects.toThrow(
      'Unauthorized',
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('joins array validation messages from api errors', async () => {
    mock.onPost('/auth/request-otp').reply(400, {
      message: ['phone must be valid', 'countryIso must be supported'],
    });

    await expect(requestOtp('not-a-phone', 'NG')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'phone must be valid, countryIso must be supported',
    });
  });

  it('fetches auth countries for the country selector', async () => {
    mock.onGet('/auth/countries').reply(200, {
      countries: [
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
      ],
    });

    await expect(fetchAuthCountries()).resolves.toEqual({
      countries: [
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
      ],
    });
  });

  it('preserves structured error details from api errors', async () => {
    const details = { retryAfterMs: 60_000, scope: 'ip' };

    mock.onPost('/auth/verify-otp').reply(429, {
      message: 'Too many invalid OTP attempts from this network. Try again later.',
      details,
    });

    try {
      await verifyOtp('08012345678', 'NG', '000000');
      throw new Error('Expected verifyOtp to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 429,
        message:
          'Too many invalid OTP attempts from this network. Try again later.',
        details,
      });
    }
  });
});
