import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, verifyOtp } from '../lib/api';

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

describe('api client OTP verify does not retry', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it.each([503, 500])(
    'does not retry HTTP %s verify failures',
    async (status) => {
      let attempts = 0;
      mock.onPost('/auth/verify-otp').reply(() => {
        attempts += 1;
        return [status, { message: 'upstream unavailable' }];
      });

      await expect(
        verifyOtp('08012345678', 'NG', '123456'),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status,
        message: 'upstream unavailable',
      });
      expect(attempts).toBe(1);
    },
  );
});
