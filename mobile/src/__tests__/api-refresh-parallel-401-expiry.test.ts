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

describe('api client parallel 401 expiry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session for each in-flight 401 when no refresh token is stored', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession,
      onUnauthorized,
    });

    let expiredHits = 0;
    let releaseExpired: (() => void) | undefined;
    const bothExpired = new Promise<void>((resolve) => {
      releaseExpired = resolve;
    });

    mock.onGet('/goals/active').reply(async () => {
      expiredHits += 1;
      if (expiredHits >= 2) releaseExpired?.();
      await bothExpired;
      return [401, { message: 'Unauthorized' }];
    });

    const results = await Promise.allSettled([
      getActiveGoal(),
      getActiveGoal(),
    ]);

    expect(results).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          name: 'ApiError',
          status: 401,
          message: 'Your session expired. Sign in again.',
        }),
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          name: 'ApiError',
          status: 401,
          message: 'Your session expired. Sign in again.',
        }),
      }),
    ]);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenNthCalledWith(1, { reason: 'expired' });
    expect(onUnauthorized).toHaveBeenNthCalledWith(2, { reason: 'expired' });
    expect(persistSession).not.toHaveBeenCalled();
    expect(mock.history.post).toHaveLength(0);
  });
});
