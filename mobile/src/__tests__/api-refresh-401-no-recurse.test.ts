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

describe('api client refresh 401 does not recurse', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires once when refresh itself returns 401 and does not POST /auth/refresh again', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-token',
      persistSession,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply(401, { message: 'Unauthorized' });
    mock
      .onPost('/auth/refresh')
      .reply(401, { message: 'Invalid refresh token' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(persistSession).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
    expect(
      mock.history.post.filter((request) => request.url === '/auth/refresh'),
    ).toHaveLength(1);
    expect(
      mock.history.get.filter((request) => request.url === '/goals/active'),
    ).toHaveLength(1);
  });
});
