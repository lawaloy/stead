import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountProfile,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const idleAuth = {
  getToken: async () => null as string | null,
  getRefreshToken: async () => null as string | null,
  persistSession: async () => undefined,
  onUnauthorized: () => undefined,
};

describe('api account session expiry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session on 401 from account and privacy endpoints', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/account').reply(401, { message: 'Invalid token' });
    await expect(getAccount()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });

    mock.onPatch('/account/profile').reply(401, { message: 'Invalid token' });
    await expect(
      updateAccountProfile({ displayName: 'Ada' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(2);

    mock.onGet('/account/export').reply(401, { message: 'Unauthorized' });
    await expect(exportAccountData()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(3);

    mock.onDelete('/account').reply(401, { message: 'Session expired' });
    await expect(deleteAccount()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(4);
    expect(onUnauthorized).toHaveBeenNthCalledWith(4, { reason: 'expired' });
  });
});
