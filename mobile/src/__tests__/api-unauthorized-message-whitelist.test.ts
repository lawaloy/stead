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

describe('api client unauthorized message whitelist', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('softens only the known session-expiry messages after a failed refresh', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-token',
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').replyOnce(401, { message: 'Session expired' });
    mock
      .onPost('/auth/refresh')
      .reply(401, { message: 'Invalid refresh token' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });

  it('keeps operator-specific 401 copy while still expiring the session', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply(401, { message: 'Device revoked' });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Device revoked',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });
});
