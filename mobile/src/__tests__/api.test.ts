import { z } from 'zod';
import { createAxiosMock } from './axios-mock';
import {
  ApiError,
  apiClient,
  configureApiAuth,
  fetchAuthCountries,
  parseApiValidationErrors,
  requestOtp,
  verifyOtp,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('../lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  },
}));

describe('api client', () => {
  const mock = createAxiosMock(apiClient);

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
      expect(config.headers?.['X-Stead-Device-Id']).toBe(
        '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      );
      return [200, { ok: true, otp: '123456' }];
    });

    const response = await requestOtp('08012345678', 'NG');
    expect(response.ok).toBe(true);
    expect(response.otp).toBe('123456');
  });

  it('posts country-aware payloads for otp requests', async () => {
    mock.onPost('/auth/request-otp').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        phone: '+14155552671',
        countryIso: 'US',
      });
      return [200, { ok: true, otp: '123456' }];
    });

    await expect(requestOtp('+14155552671', 'US')).resolves.toEqual({
      ok: true,
      otp: '123456',
    });
  });

  it('posts country-aware payloads for otp verification', async () => {
    mock.onPost('/auth/verify-otp').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        phone: '+442071838750',
        countryIso: 'GB',
        otp: '654321',
      });
      return [200, { token: 'jwt-token' }];
    });

    await expect(
      verifyOtp('+442071838750', 'GB', '654321'),
    ).resolves.toEqual({
      token: 'jwt-token',
    });
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

  it('uses plain string response bodies as the ApiError message', async () => {
    mock.onPost('/auth/request-otp').reply(502, 'upstream unavailable');

    await expect(requestOtp('08012345678', 'NG')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: 'upstream unavailable',
    });
  });

  it('maps non-Axios rejections to Unexpected network error', async () => {
    const responseInterceptor = (
      apiClient.interceptors.response as unknown as {
        handlers: {
          rejected?: (error: unknown) => Promise<never>;
        }[];
      }
    ).handlers.find((handler) => typeof handler?.rejected === 'function');

    expect(responseInterceptor?.rejected).toBeDefined();

    await expect(
      responseInterceptor!.rejected!(new Error('socket hung up')),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unexpected network error',
    });
  });

  it('joins Zod validation issues and ignores non-Zod values', () => {
    const zodError = new z.ZodError([
      {
        code: 'custom',
        path: ['phone'],
        message: 'phone must be valid',
      },
      {
        code: 'custom',
        path: ['countryIso'],
        message: 'countryIso must be supported',
      },
    ]);

    expect(parseApiValidationErrors(zodError)).toBe(
      'phone must be valid, countryIso must be supported',
    );
    expect(parseApiValidationErrors(new Error('nope'))).toBeNull();
    expect(parseApiValidationErrors({ message: 'plain' })).toBeNull();
  });
});
