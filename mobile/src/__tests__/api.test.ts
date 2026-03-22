import MockAdapter from 'axios-mock-adapter';
import {
  apiClient,
  configureApiAuth,
  requestOtp,
  verifyOtp,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

describe('api client', () => {
  const mock = new MockAdapter(apiClient);

  afterEach(() => {
    mock.reset();
  });

  it('adds Authorization header when token exists', async () => {
    configureApiAuth({
      getToken: async () => 'jwt-token',
      onUnauthorized: () => undefined,
    });

    mock.onPost('/auth/request-otp').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer jwt-token');
      return [200, { ok: true, otp: '123456' }];
    });

    const response = await requestOtp('+2348012345678');
    expect(response.ok).toBe(true);
    expect(response.otp).toBe('123456');
  });

  it('calls unauthorized handler on 401', async () => {
    const onUnauthorized = jest.fn();
    configureApiAuth({
      getToken: async () => null,
      onUnauthorized,
    });

    mock.onPost('/auth/verify-otp').reply(401, { message: 'Unauthorized' });

    await expect(verifyOtp('+2348012345678', '000000')).rejects.toThrow(
      'Unauthorized',
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
