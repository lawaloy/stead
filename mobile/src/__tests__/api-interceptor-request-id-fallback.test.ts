import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, getActiveGoal } from '../lib/api';

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

describe('api interceptor request id fallback', () => {
  const mock = createAxiosMock(apiClient);

  beforeEach(() => {
    configureApiAuth(idleAuth);
  });

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('preserves the outbound X-Request-ID when the server omits it', async () => {
    let outboundRequestId: string | undefined;

    mock.onGet('/goals/active').reply((config) => {
      outboundRequestId =
        typeof config.headers?.get === 'function'
          ? config.headers.get('X-Request-ID')
          : config.headers?.['X-Request-ID'];
      return [503, { message: 'temporarily unavailable' }];
    });

    try {
      await getActiveGoal();
      throw new Error('Expected getActiveGoal to reject');
    } catch (error) {
      expect(outboundRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(error).toMatchObject({
        name: 'ApiError',
        status: 503,
        message: 'temporarily unavailable',
        requestId: outboundRequestId,
      });
    }
  });
});
