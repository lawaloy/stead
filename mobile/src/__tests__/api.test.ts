import { z } from 'zod';
import { createAxiosMock } from './axios-mock';
import {
  ApiError,
  apiClient,
  configureApiAuth,
  fetchAuthCountries,
  getActiveGoal,
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

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api client', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('adds Authorization header when token exists', async () => {
    configureApiAuth({
      ...idleAuth,
      getToken: async () => 'jwt-token',
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
      return [
        200,
        {
          token: 'jwt-token',
          refreshToken: 'refresh-token',
          expiresIn: 900,
        },
      ];
    });

    await expect(verifyOtp('+442071838750', 'GB', '654321')).resolves.toEqual({
      token: 'jwt-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
  });

  it('does not clear the session on public auth 401 responses', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      ...idleAuth,
      onUnauthorized,
    });

    mock.onPost('/auth/verify-otp').reply(401, { message: 'Unauthorized' });

    await expect(verifyOtp('08012345678', 'NG', '000000')).rejects.toThrow(
      'Unauthorized',
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('refreshes once and retries the original authenticated request on 401', async () => {
    const onUnauthorized = jest.fn();
    let accessToken: string | null = 'expired-jwt';
    let refreshToken: string | null = 'refresh-token';
    const persistSession = jest.fn(
      async (session: { token: string; refreshToken: string }) => {
        accessToken = session.token;
        refreshToken = session.refreshToken;
      },
    );
    configureApiAuth({
      getToken: async () => accessToken,
      getRefreshToken: async () => refreshToken,
      persistSession,
      onUnauthorized,
    });

    mock.onGet('/goals/active').replyOnce(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').replyOnce((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        refreshToken: 'refresh-token',
      });
      return [
        200,
        {
          token: 'new-jwt',
          refreshToken: 'new-refresh',
          expiresIn: 900,
        },
      ];
    });
    mock.onGet('/goals/active').replyOnce((config) => {
      expect(config.headers?.Authorization).toBe('Bearer new-jwt');
      return [
        200,
        {
          id: 'goal_1',
          userId: 'user_1',
          name: 'Rent',
          amountTotalKobo: 120_000_000,
          dueDate: '2026-12-31T00:00:00.000Z',
          monthlyIncomeKobo: 30_000_000,
          isActive: true,
          status: 'active',
          endedAt: null,
          createdAt: '2026-06-21T12:00:00.000Z',
        },
      ];
    });

    await expect(getActiveGoal()).resolves.toMatchObject({ id: 'goal_1' });
    expect(persistSession).toHaveBeenCalledWith({
      token: 'new-jwt',
      refreshToken: 'new-refresh',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('expires the session when refresh fails after an authenticated 401', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-token',
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply(401, { message: 'Unauthorized' });
    mock
      .onPost('/auth/refresh')
      .reply(401, { message: 'Invalid refresh token' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
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
      message:
        'Too many invalid OTP attempts from this network. Try again later.',
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

  it('rejects malformed auth responses that fail Zod parsing', async () => {
    mock.onGet('/auth/countries').reply(200, {
      countries: [{ iso: 'NG' }],
    });
    await expect(fetchAuthCountries()).rejects.toThrow();

    mock.onPost('/auth/request-otp').reply(200, { ok: false });
    await expect(requestOtp('08012345678', 'NG')).rejects.toThrow();

    mock.onPost('/auth/verify-otp').reply(200, { accessToken: 'jwt-token' });
    await expect(verifyOtp('08012345678', 'NG', '123456')).rejects.toThrow();
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
