import { createAxiosMock } from './axios-mock';
import { ApiError, apiClient } from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('../lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  },
}));

describe('api interceptor ApiError passthrough', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
  });

  it('rethrows a pre-built ApiError instead of wrapping it as a network error', async () => {
    const responseInterceptor = (
      apiClient.interceptors.response as unknown as {
        handlers: {
          rejected?: (error: unknown) => Promise<never>;
        }[];
      }
    ).handlers.find((handler) => typeof handler?.rejected === 'function');

    expect(responseInterceptor?.rejected).toBeDefined();

    const original = new ApiError({
      message: 'OTP request retry policy exhausted',
      status: 503,
      details: { attempt: 3 },
    });

    await expect(responseInterceptor!.rejected!(original)).rejects.toBe(
      original,
    );
    await expect(
      responseInterceptor!.rejected!(original),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'OTP request retry policy exhausted',
      status: 503,
      details: { attempt: 3 },
    });
  });
});
