import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, getActiveGoal } from '../lib/api';
import { reportError } from '../lib/observability';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('../lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  },
}));

jest.mock('../lib/observability', () => ({
  reportError: jest.fn(),
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

const reportErrorMock = reportError as jest.MockedFunction<typeof reportError>;

describe('api interceptor 401 error reporting', () => {
  const mock = createAxiosMock(apiClient);

  beforeEach(() => {
    configureApiAuth(idleAuth);
    reportErrorMock.mockClear();
  });

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session without reporting an authenticated 401 to Sentry', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/goals/active').reply(401, { message: 'Invalid token' });
    mock.onPost('/auth/refresh').reply(200, {
      token: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    await expect(getActiveGoal()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(
      mock.history.post.filter((request) => request.url === '/auth/refresh'),
    ).toHaveLength(0);
  });
});
