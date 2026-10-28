import * as Sentry from '@sentry/react-native';
import {
  initializeObservability,
  reportError,
  resetObservabilityForTests,
} from '../lib/observability';

jest.mock('../lib/env', () => ({
  env: {
    EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
    EXPO_PUBLIC_APP_ENV: 'test',
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0,
  },
}));

describe('mobile observability', () => {
  beforeEach(() => {
    resetObservabilityForTests();
    jest.clearAllMocks();
  });

  it('initializes Sentry once without default PII', () => {
    expect(initializeObservability()).toBe(true);
    expect(initializeObservability()).toBe(true);

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.invalid/1',
        environment: 'test',
        sendDefaultPii: false,
        tracesSampleRate: 0,
      }),
    );
  });

  it('reports only a safe error and allowlisted context', () => {
    const source = Object.assign(new Error('phone=+2348012345678'), {
      details: { accessToken: 'secret' },
    });
    source.name = 'phone=+2348012345678';
    source.stack = 'phone=+2348012345678\n    at operation (app.ts:1:2)';

    expect(
      reportError(source, {
        area: 'api',
        operation: 'GET',
        requestId: 'request_1',
        route: '/goals/:id',
        statusCode: 503,
      }),
    ).toBe('event-id');

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ApiError',
        message: 'API request failed',
        stack: expect.stringContaining('at operation (app.ts:1:2)') as unknown,
      }),
      {
        tags: { area: 'api', operation: 'GET' },
        extra: {
          requestId: 'request_1',
          route: '/goals/:id',
          statusCode: 503,
        },
      },
    );
    expect(
      JSON.stringify((Sentry.captureException as jest.Mock).mock.calls),
    ).not.toContain('+2348012345678');
  });

  it('strips request and breadcrumb payloads before sending', () => {
    initializeObservability();
    const options = (Sentry.init as jest.Mock).mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(
      options.beforeSend({
        user: { id: 'user_1' },
        request: {
          cookies: 'session=secret',
          data: { otp: '123456' },
          headers: { authorization: 'Bearer secret' },
          query_string: 'phone=1234',
          url: '/auth/verify-otp',
        },
        breadcrumbs: [
          {
            message: 'request phone=1234',
            data: { token: 'secret' },
          },
        ],
      }),
    ).toEqual({
      user: undefined,
      request: {
        cookies: undefined,
        data: undefined,
        headers: undefined,
        query_string: undefined,
        url: undefined,
      },
      breadcrumbs: undefined,
    });
  });
});
