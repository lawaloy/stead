import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, requestOtp } from '../lib/api';

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

describe('api client public OTP request 401', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not treat a 401 OTP request as session expiry', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => 'refresh-live',
      persistSession,
      onUnauthorized,
    });

    mock.onPost('/auth/request-otp').reply(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').reply(200, {
      token: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    await expect(requestOtp('08012345678', 'NG')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Unauthorized',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
    expect(
      mock.history.post.filter((request) => request.url === '/auth/refresh'),
    ).toHaveLength(0);
    expect(
      mock.history.post.filter(
        (request) => request.url === '/auth/request-otp',
      ),
    ).toHaveLength(1);
  });
});
