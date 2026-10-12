import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, createTransaction } from '../lib/api';

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

const transactionResponse = {
  id: 'tx_1',
  userId: 'user_1',
  goalId: 'goal_1',
  amountKobo: 500_000,
  direction: 'in' as const,
  occurredAt: '2026-06-21T12:00:00.000Z',
  note: 'manual entry',
  createdAt: '2026-06-21T12:01:00.000Z',
};

const createPayload = {
  direction: 'in' as const,
  amountKobo: 500_000,
  occurredAt: '2026-06-21T12:00:00.000Z',
  note: 'manual entry',
  goalId: 'goal_1',
};

describe('api client refresh retry drops sticky adapter', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('deletes a stuck adapter so the refreshed retry goes through the client', async () => {
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

    let stickyAdapterUsed = false;
    mock.onPost('/transactions').replyOnce((config) => {
      config.adapter = async () => {
        stickyAdapterUsed = true;
        throw new Error('stuck adapter');
      };
      return [401, { message: 'Unauthorized' }];
    });
    mock.onPost('/auth/refresh').replyOnce(200, {
      token: 'new-jwt',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });
    mock.onPost('/transactions').replyOnce((config) => {
      expect(config.adapter).toBeUndefined();
      expect(config.headers?.Authorization).toBe('Bearer new-jwt');
      expect(JSON.parse(config.data as string)).toEqual(createPayload);
      return [200, transactionResponse];
    });

    await expect(createTransaction(createPayload)).resolves.toEqual(
      transactionResponse,
    );
    expect(stickyAdapterUsed).toBe(false);
    expect(persistSession).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
