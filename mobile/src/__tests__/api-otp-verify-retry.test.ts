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

describe('api client OTP verification retry policy', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it.each([408, 425, 500, 503])(
    'retries HTTP %s verify failures with one idempotency key',
    async (status) => {
      jest.useFakeTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      let attempts = 0;
      const idempotencyKeys: string[] = [];
      mock.onPost('/auth/verify-otp').reply((config) => {
        attempts += 1;
        idempotencyKeys.push(String(config.headers?.['Idempotency-Key']));
        if (attempts === 3) {
          return [
            201,
            { token: 'access', refreshToken: 'refresh', expiresIn: 900 },
          ];
        }
        return [status, { message: 'upstream unavailable' }];
      });

      const response = verifyOtp('08012345678', 'NG', '123456');
      await jest.runAllTimersAsync();

      await expect(response).resolves.toEqual({
        token: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
      expect(attempts).toBe(3);
      expect(new Set(idempotencyKeys).size).toBe(1);
    },
  );

  it('retries a client timeout with the same idempotency key', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    mock.onPost('/auth/verify-otp').timeoutOnce();
    mock.onPost('/auth/verify-otp').reply(201, {
      token: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const response = verifyOtp('08012345678', 'NG', '123456');
    await jest.runAllTimersAsync();

    await expect(response).resolves.toMatchObject({ token: 'access' });
    const idempotencyKeys = mock.history.post.map((config) =>
      String(config.headers?.['Idempotency-Key']),
    );
    expect(idempotencyKeys).toHaveLength(2);
    expect(new Set(idempotencyKeys).size).toBe(1);
  });

  it('does not retry a rejected OTP', async () => {
    let attempts = 0;
    mock.onPost('/auth/verify-otp').reply(() => {
      attempts += 1;
      return [400, { message: 'Invalid phone or code' }];
    });

    await expect(
      verifyOtp('08012345678', 'NG', '000000'),
    ).rejects.toMatchObject({ status: 400 });
    expect(attempts).toBe(1);
  });
});
