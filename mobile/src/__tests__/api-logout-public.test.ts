import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, logoutSession } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api logout public contract', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('omits falsy refresh and allDevices flags from the logout body', async () => {
    mock.onPost('/auth/logout').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({});
      return [200, { ok: true }];
    });

    await expect(logoutSession()).resolves.toEqual({ ok: true });
    await expect(
      logoutSession({ refreshToken: null, allDevices: false }),
    ).resolves.toEqual({ ok: true });
  });

  it('includes a live refresh token and allDevices when both are set', async () => {
    mock.onPost('/auth/logout').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        refreshToken: 'refresh-live',
        allDevices: true,
      });
      return [200, { ok: true }];
    });

    await expect(
      logoutSession({ refreshToken: 'refresh-live', allDevices: true }),
    ).resolves.toEqual({ ok: true });
  });

  it('does not treat a 401 logout response as session expiry', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-live',
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onPost('/auth/logout').reply(401, { message: 'Invalid token' });
    await expect(
      logoutSession({ refreshToken: 'refresh-live' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid token',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
