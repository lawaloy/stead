import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  confirmTransactionImport,
  previewTransactionImport,
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

describe('api import session expiry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('expires the session on 401 from import preview and confirm', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'expired-jwt',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock
      .onPost('/transactions/import/preview')
      .reply(401, { message: 'Invalid token' });
    await expect(
      previewTransactionImport({
        csv: 'date,description,amount,type\n2026-09-01,Salary,100,credit',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });

    mock
      .onPost('/transactions/import')
      .reply(401, { message: 'Invalid token' });
    await expect(
      confirmTransactionImport({
        csv: 'date,description,amount,type\n2026-09-01,Salary,100,credit',
        rowNumbers: [2],
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session expired. Sign in again.',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledWith({ reason: 'expired' });
  });
});
