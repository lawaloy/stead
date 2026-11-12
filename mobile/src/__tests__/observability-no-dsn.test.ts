import * as Sentry from '@sentry/react-native';
import {
  initializeObservability,
  reportError,
  resetObservabilityForTests,
} from '../lib/observability';

jest.mock('../lib/env', () => ({
  env: {
    EXPO_PUBLIC_SENTRY_DSN: undefined,
    EXPO_PUBLIC_APP_ENV: 'test',
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0,
  },
}));

describe('mobile observability without a DSN', () => {
  beforeEach(() => {
    resetObservabilityForTests();
    jest.clearAllMocks();
  });

  it('does not initialize Sentry or report errors when the DSN is unset', () => {
    expect(initializeObservability()).toBe(false);
    expect(
      reportError(new Error('phone=+2348012345678'), {
        area: 'api',
        operation: 'GET',
        route: '/goals/:id',
        statusCode: 503,
      }),
    ).toBeUndefined();

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
