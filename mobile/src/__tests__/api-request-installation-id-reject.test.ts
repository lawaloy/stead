import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, getActiveGoal } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('../lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => {
      throw new Error('installation id unavailable');
    },
  },
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api request interceptor installation id lookup failure', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('fails closed without sending the request when getOrCreateId rejects', async () => {
    configureApiAuth(idleAuth);
    mock.onGet('/goals/active').reply(200, {
      id: 'goal_1',
      name: 'Rent',
      amountTotalKobo: 100_000,
      dueDate: '2026-12-01T00:00:00.000Z',
      isActive: true,
    });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unexpected network error',
    });
    expect(mock.history.get).toHaveLength(0);
  });
});
