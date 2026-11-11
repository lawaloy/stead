import { createAxiosMock } from './axios-mock';
import { ApiError, apiClient } from '../lib/api';
import { reportError } from '../lib/observability';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('../lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
  },
}));

jest.mock('../lib/observability', () => ({
  reportError: jest.fn(),
}));

const reportErrorMock = reportError as jest.MockedFunction<typeof reportError>;

describe('api interceptor ApiError passthrough', () => {
  const mock = createAxiosMock(apiClient);

  afterEach(() => {
    mock.reset();
    reportErrorMock.mockClear();
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
    expect(reportErrorMock).toHaveBeenCalledWith(original, {
      area: 'api',
      operation: 'UNKNOWN',
      requestId: undefined,
      route: 'unknown',
      statusCode: 503,
    });
  });

  it('reports pre-built server ApiErrors and skips client statuses', async () => {
    const responseInterceptor = (
      apiClient.interceptors.response as unknown as {
        handlers: {
          rejected?: (error: unknown) => Promise<never>;
        }[];
      }
    ).handlers.find((handler) => typeof handler?.rejected === 'function');

    const unavailable = new ApiError({
      message: 'OTP request retry policy exhausted',
      status: 503,
    });
    const rateLimited = new ApiError({
      message: 'Too many requests',
      status: 429,
    });

    await expect(responseInterceptor!.rejected!(unavailable)).rejects.toBe(
      unavailable,
    );
    await expect(responseInterceptor!.rejected!(rateLimited)).rejects.toBe(
      rateLimited,
    );

    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      unavailable,
      expect.objectContaining({
        area: 'api',
        statusCode: 503,
      }),
    );
  });
});
