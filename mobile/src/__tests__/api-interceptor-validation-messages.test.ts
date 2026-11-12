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

describe('api interceptor NestJS validation messages', () => {
  const mock = createAxiosMock(apiClient);

  beforeEach(() => {
    configureApiAuth(idleAuth);
  });

  afterEach(() => {
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('joins array ValidationPipe messages into the ApiError message', async () => {
    mock.onPost('/auth/request-otp').reply(400, {
      message: [
        'phone must be a string',
        'countryIso must be a valid ISO code',
      ],
      error: 'Bad Request',
      statusCode: 400,
    });

    await expect(requestOtp('08012345678', 'NG')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'phone must be a string, countryIso must be a valid ISO code',
    });
  });
});
