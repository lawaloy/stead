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

describe('api client OTP retry statuses', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it.each([408, 425])(
    'retries HTTP %s OTP failures with one idempotency key',
    async (status) => {
      jest.useFakeTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const idempotencyKeys: string[] = [];
      let attempts = 0;

      mock.onPost('/auth/request-otp').reply((config) => {
        attempts += 1;
        idempotencyKeys.push(String(config.headers?.['Idempotency-Key']));
        if (attempts < 3) return [status, { message: 'still processing' }];
        return [200, { ok: true, otp: '123456' }];
      });

      const responsePromise = requestOtp('08012345678', 'NG');
      await jest.runAllTimersAsync();

      await expect(responsePromise).resolves.toEqual({
        ok: true,
        otp: '123456',
      });
      expect(attempts).toBe(3);
      expect(new Set(idempotencyKeys).size).toBe(1);
      expect(idempotencyKeys[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    },
  );
});
