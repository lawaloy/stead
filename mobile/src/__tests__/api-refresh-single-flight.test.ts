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

const goalResponse = {
  id: 'goal_1',
  userId: 'user_1',
  name: 'Rent',
  amountTotalKobo: 120_000_000,
  dueDate: '2026-12-31T00:00:00.000Z',
  monthlyIncomeKobo: 30_000_000,
  isActive: true,
  status: 'active' as const,
  endedAt: null,
  createdAt: '2026-06-21T12:00:00.000Z',
};

const refreshedSession = {
  token: 'new-jwt',
  refreshToken: 'new-refresh',
  expiresIn: 900,
};

describe('api client refresh single-flight', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('shares one refresh across two authenticated 401s in flight', async () => {
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

    let refreshCalls = 0;
    let expiredHits = 0;
    let releaseExpired: (() => void) | undefined;
    const bothExpired = new Promise<void>((resolve) => {
      releaseExpired = resolve;
    });

    mock.onGet('/goals/active').reply(async (config) => {
      if (config.headers?.Authorization === 'Bearer expired-jwt') {
        expiredHits += 1;
        if (expiredHits >= 2) releaseExpired?.();
        await bothExpired;
        return [401, { message: 'Unauthorized' }];
      }
      expect(config.headers?.Authorization).toBe('Bearer new-jwt');
      return [200, goalResponse];
    });
    mock.onPost('/auth/refresh').reply(() => {
      refreshCalls += 1;
      return [200, refreshedSession];
    });

    await expect(
      Promise.all([getActiveGoal(), getActiveGoal()]),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'goal_1' }),
      expect.objectContaining({ id: 'goal_1' }),
    ]);
    expect(refreshCalls).toBe(1);
    expect(persistSession).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not refresh again when the retried request still returns 401', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-token',
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').replyOnce(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').replyOnce(200, refreshedSession);
    mock.onGet('/goals/active').replyOnce(401, { message: 'Unauthorized' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(
      mock.history.post.filter((entry) => entry.url === '/auth/refresh'),
    ).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });

  it('expires the session without calling refresh when no refresh token is stored', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply(401, { message: 'Unauthorized' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(mock.history.post).toHaveLength(0);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });
});
