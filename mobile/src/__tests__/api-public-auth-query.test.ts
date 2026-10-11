import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, fetchAuthCountries } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api public auth URLs with query strings', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not treat a 401 on a public auth URL with query params as session expiry', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-live',
      persistSession,
      onUnauthorized,
    });

    mock
      .onGet('/auth/countries?locale=en')
      .reply(401, { message: 'Invalid token' });
    mock
      .onPost('/auth/logout?reason=manual')
      .reply(401, { message: 'Invalid token' });
    mock.onPost('/auth/refresh').reply(200, {
      token: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    await expect(
      apiClient.get('/auth/countries?locale=en'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid token',
    });
    await expect(
      apiClient.post('/auth/logout?reason=manual', {}),
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

  it('still expires the session for a protected URL that includes query params', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active?fresh=1').reply(401, { message: 'Unauthorized' });

    await expect(apiClient.get('/goals/active?fresh=1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });

  it('keeps the query-less countries helper on the public path', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-live',
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/auth/countries').reply(401, { message: 'Invalid token' });

    await expect(fetchAuthCountries()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid token',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
