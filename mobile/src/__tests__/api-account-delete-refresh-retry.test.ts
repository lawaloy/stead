import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, deleteAccount } from '../lib/api';

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

const deleteResponse = {
  ok: true as const,
  deletedAt: '2026-09-08T12:01:00.000Z',
};

describe('api client deleteAccount refresh retry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('refreshes once and retries deleteAccount with the confirmation body', async () => {
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

    mock.onDelete('/account').replyOnce(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').replyOnce((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        refreshToken: 'refresh-token',
      });
      expect(config.headers?.['X-Stead-Device-Id']).toBe(
        '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      );
      return [
        200,
        {
          token: 'new-jwt',
          refreshToken: 'new-refresh',
          expiresIn: 900,
        },
      ];
    });
    mock.onDelete('/account').replyOnce((config) => {
      expect(config.headers?.Authorization).toBe('Bearer new-jwt');
      expect(JSON.parse(config.data as string)).toEqual({
        confirmation: 'DELETE',
      });
      return [200, deleteResponse];
    });

    await expect(deleteAccount()).resolves.toEqual(deleteResponse);
    expect(persistSession).toHaveBeenCalledTimes(1);
    expect(persistSession).toHaveBeenCalledWith({
      token: 'new-jwt',
      refreshToken: 'new-refresh',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
