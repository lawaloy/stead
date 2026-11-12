import { z } from 'zod';
import { createAxiosMock } from './axios-mock';
import { apiClient, configureApiAuth, requestOtp, verifyOtp } from '../lib/api';

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

describe('api client OTP Zod contract fail-fast', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mock.reset();
    configureApiAuth(idleAuth);
  });

  it('does not retry a malformed verify success after a transient 503', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    let attempts = 0;
    mock.onPost('/auth/verify-otp').reply(() => {
      attempts += 1;
      if (attempts === 1) {
        return [503, { message: 'upstream unavailable' }];
      }
      return [201, { accessToken: 'jwt-token' }];
    });

    const response = verifyOtp('08012345678', 'NG', '123456');
    const expectation = expect(response).rejects.toBeInstanceOf(z.ZodError);
    await jest.runAllTimersAsync();
    await expectation;
    expect(attempts).toBe(2);
  });

  it('does not retry a malformed request success after a transient 503', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    let attempts = 0;
    mock.onPost('/auth/request-otp').reply(() => {
      attempts += 1;
      if (attempts === 1) {
        return [503, { message: 'upstream unavailable' }];
      }
      return [200, { ok: false }];
    });

    const response = requestOtp('08012345678', 'NG');
    const expectation = expect(response).rejects.toBeInstanceOf(z.ZodError);
    await jest.runAllTimersAsync();
    await expectation;
    expect(attempts).toBe(2);
  });
});
