import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  deleteTransaction,
  getActiveGoal,
} from '../lib/api';
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

describe('api interceptor error reporting', () => {
  const mock = createAxiosMock(apiClient);

  beforeEach(() => {
    configureApiAuth(idleAuth);
    reportErrorMock.mockClear();
  });

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not report client HTTP failures', async () => {
    mock.onGet('/goals/active').reply(404, { message: 'Goal not found' });

    await expect(getActiveGoal()).resolves.toBeNull();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reports server failures with UUID routes redacted', async () => {
    const transactionId = '550e8400-e29b-41d4-a716-446655440000';
    mock.onDelete(`/transactions/${transactionId}`).reply(503, {
      message: 'unavailable',
    });

    await expect(deleteTransaction(transactionId)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ApiError',
        status: 503,
      }),
      expect.objectContaining({
        area: 'api',
        operation: 'DELETE',
        route: '/transactions/:id',
        statusCode: 503,
      }),
    );
    expect(JSON.stringify(reportErrorMock.mock.calls)).not.toContain(
      transactionId,
    );
  });
});
