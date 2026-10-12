import { createAxiosMock } from './axios-mock';
import {
  abandonInFlightRefresh,
  apiClient,
  configureApiAuth,
  getActiveGoal,
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

describe('api client refresh abandon during token read', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not call refresh when logout abandons while the refresh token is still being read', async () => {
    const onUnauthorized = jest.fn();
    const persistSession = jest.fn();
    let releaseRead: ((value: string) => void) | undefined;
    let markReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const refreshTokenRead = new Promise<string>((resolve) => {
      releaseRead = resolve;
    });

    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => {
        markReadStarted?.();
        return refreshTokenRead;
      },
      persistSession,
      onUnauthorized,
    });

    mock.onGet('/goals/active').replyOnce(401, { message: 'Unauthorized' });
    mock.onPost('/auth/refresh').reply(200, {
      token: 'should-not-refresh',
      refreshToken: 'should-not-refresh',
      expiresIn: 900,
    });

    const pending = getActiveGoal();
    await readStarted;
    abandonInFlightRefresh();
    releaseRead?.('refresh-token');

    await expect(pending).rejects.toMatchObject({
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(persistSession).not.toHaveBeenCalled();
    expect(
      mock.history.post.filter((entry) => entry.url === '/auth/refresh'),
    ).toHaveLength(0);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });
});
