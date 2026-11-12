import { AxiosHeaders } from 'axios';
import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth } from '../lib/api';
import { HTTP_HEADERS } from '../contracts/generated/runtime.gen';

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

describe('api interceptor preserves client request ids', () => {
  const mock = createAxiosMock(apiClient);

  beforeEach(() => {
    configureApiAuth(idleAuth);
  });

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not replace a caller-supplied X-Request-ID', async () => {
    const clientRequestId = 'client-trace-1';
    let outboundRequestId: string | undefined;

    mock.onGet('/goals/active').reply((config) => {
      outboundRequestId =
        typeof config.headers?.get === 'function'
          ? config.headers.get(HTTP_HEADERS.requestId)
          : config.headers?.[HTTP_HEADERS.requestId];
      return [200, { id: 'goal_1' }];
    });

    await apiClient.get('/goals/active', {
      headers: new AxiosHeaders({
        [HTTP_HEADERS.requestId]: clientRequestId,
      }),
    });

    expect(outboundRequestId).toBe(clientRequestId);
  });
});
