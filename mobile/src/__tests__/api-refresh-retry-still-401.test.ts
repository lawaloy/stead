import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, getActiveGoal } from '../lib/api';

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

describe('api client refresh retry still 401', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session once when a refreshed retry is still unauthorized', async () => {
    const onUnauthorized = jest.fn();
    let accessToken: string | null = 'expired-jwt';
    const persistSession = jest.fn(
      async (session: { token: string; refreshToken: string }) => {
        accessToken = session.token;
      },
    );
    configureApiAuth({
      getToken: async () => accessToken,
      getRefreshToken: async () => 'refresh-token',
      persistSession,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply((config) => {
      if (config.headers?.Authorization === 'Bearer new-jwt') {
        return [401, { message: 'Unauthorized' }];
      }
      expect(config.headers?.Authorization).toBe('Bearer expired-jwt');
      return [401, { message: 'Unauthorized' }];
    });
    mock.onPost('/auth/refresh').reply((config) => {
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

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(persistSession).toHaveBeenCalledTimes(1);
    expect(persistSession).toHaveBeenCalledWith({
      token: 'new-jwt',
      refreshToken: 'new-refresh',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
    expect(
      mock.history.get.filter((req) => req.url === '/goals/active'),
    ).toHaveLength(2);
    expect(
      mock.history.post.filter((req) => req.url === '/auth/refresh'),
    ).toHaveLength(1);
  });
});
