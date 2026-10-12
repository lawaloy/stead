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

describe('api import forbidden responses', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not treat 403 import preview or confirm as session expiry', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => 'jwt-token',
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized,
    });

    mock.onPost('/transactions/import/preview').reply(403, {
      message: 'Forbidden',
    });
    await expect(
      previewTransactionImport({
        csv: 'date,description,amount,type\n2026-09-01,Salary,100,credit',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Forbidden',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();

    mock.onPost('/transactions/import').reply(403, { message: 'Forbidden' });
    await expect(
      confirmTransactionImport({
        csv: 'date,description,amount,type\n2026-09-01,Salary,100,credit',
        rowNumbers: [2],
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Forbidden',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
