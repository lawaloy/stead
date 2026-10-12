import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  getAlertPreferences,
  updateAccountConsents,
  updateAlertPreferences,
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

describe('api alerts and consents session expiry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session on 401 from alerts and consent endpoints', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onGet('/alerts/preferences').reply(401, { message: 'Unauthorized' });
    await expect(getAlertPreferences()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });

    mock
      .onPatch('/alerts/preferences')
      .reply(401, { message: 'Invalid token' });
    await expect(
      updateAlertPreferences({ weeklySummaryEnabled: false }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(2);

    mock.onPut('/account/consents').reply(401, { message: 'Session expired' });
    await expect(
      updateAccountConsents({ analyticsEnabled: false }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).toHaveBeenNthCalledWith(3, { reason: 'expired' });
  });
});
