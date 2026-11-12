import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api public auth absolute URLs', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not treat a 401 on an absolute public auth URL as session expiry', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-live',
      persistSession,
      onUnauthorized,
    });

    mock
      .onGet('http://localhost:3000/auth/countries')
      .reply(401, { message: 'Invalid token' });
    mock.onPost('/auth/refresh').reply(200, {
      token: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    await expect(
      apiClient.get('http://localhost:3000/auth/countries'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid token',
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
    expect(
      mock.history.post.filter((request) => request.url === '/auth/refresh'),
    ).toHaveLength(0);
  });

  it('still expires the session for an absolute protected URL', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock
      .onGet('http://localhost:3000/goals/active')
      .reply(401, { message: 'Unauthorized' });

    await expect(
      apiClient.get('http://localhost:3000/goals/active'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });
});
