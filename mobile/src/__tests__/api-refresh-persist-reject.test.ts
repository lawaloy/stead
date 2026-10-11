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

describe('api client refresh persist failure', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session when a valid refresh cannot be persisted', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest
      .fn()
      .mockRejectedValue(new Error('secure-store-write-failed'));
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-token',
      persistSession,
      onUnauthorized,
    });

    mock.onGet('/goals/active').replyOnce(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').replyOnce(200, {
      token: 'new-jwt',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });
    mock.onGet('/goals/active').replyOnce(200, { id: 'should-not-retry' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(persistSession).toHaveBeenCalledWith({
      token: 'new-jwt',
      refreshToken: 'new-refresh',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
    expect(
      mock.history.get.filter((req) => req.url === '/goals/active'),
    ).toHaveLength(1);
    expect(
      mock.history.post.filter((req) => req.url === '/auth/refresh'),
    ).toHaveLength(1);
  });
});
