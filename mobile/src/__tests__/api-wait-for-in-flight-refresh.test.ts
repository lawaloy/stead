import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  getActiveGoal,
  waitForInFlightRefresh,
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

describe('api client waitForInFlightRefresh', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('exposes the in-flight refresh promise until rotation settles', async () => {
    let accessToken: string | null = 'expired-jwt';
    configureApiAuth({
      getToken: async () => accessToken,
      getRefreshToken: async () => 'refresh-token',
      persistSession: async (session) => {
        accessToken = session.token;
      },
      onUnauthorized: () => undefined,
    });

    let releaseRefresh:
      | ((
          value: [
            number,
            { token: string; refreshToken: string; expiresIn: number },
          ],
        ) => void)
      | undefined;
    let markRefreshStarted: (() => void) | undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const refreshGate = new Promise<
      [number, { token: string; refreshToken: string; expiresIn: number }]
    >((resolve) => {
      releaseRefresh = resolve;
    });

    mock.onGet('/goals/active').reply((config) => {
      if (config.headers?.Authorization === 'Bearer expired-jwt') {
        return [401, { message: 'Unauthorized' }];
      }
      return [200, goalResponse];
    });
    mock.onPost('/auth/refresh').reply(() => {
      markRefreshStarted?.();
      return refreshGate;
    });

    expect(waitForInFlightRefresh()).toBeNull();

    const pending = getActiveGoal();
    await refreshStarted;

    const inFlight = waitForInFlightRefresh();
    expect(inFlight).toEqual(expect.any(Promise));

    releaseRefresh?.([
      200,
      {
        token: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresIn: 900,
      },
    ]);

    await expect(pending).resolves.toMatchObject({ id: 'goal_1' });
    await expect(inFlight).resolves.toBe('new-jwt');
    expect(waitForInFlightRefresh()).toBeNull();
  });
});
