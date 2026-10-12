import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, getActiveGoal } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api finance getActiveGoal server errors', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('rejects 500 and 503 instead of treating them as a missing goal', async () => {
    mock.onGet('/goals/active').replyOnce(500, {
      message: 'Goal service unavailable',
    });
    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Goal service unavailable',
    });

    mock.onGet('/goals/active').replyOnce(503, {
      message: 'Goal service temporarily unavailable',
    });
    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'Goal service temporarily unavailable',
    });
  });
});
