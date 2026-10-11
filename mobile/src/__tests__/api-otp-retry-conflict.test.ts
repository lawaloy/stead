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

describe('api client OTP retry on conflict and validation', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it.each([
    [409, 'Idempotency-Key was already used for another OTP request.'],
    [400, 'phone must match the selected country'],
  ])('does not retry HTTP %s OTP failures', async (status, message) => {
    let attempts = 0;
    mock.onPost('/auth/request-otp').reply(() => {
      attempts += 1;
      return [status, { message }];
    });

    await expect(requestOtp('08012345678', 'NG')).rejects.toMatchObject({
      name: 'ApiError',
      status,
      message,
    });
    expect(attempts).toBe(1);
  });
});
