import * as Sentry from '@sentry/react-native';
import { env } from './env';

export type ErrorReportContext = {
  area: 'api' | 'app';
  operation: string;
  requestId?: string;
  route?: string;
  statusCode?: number;
};

let initialized = false;

export const initializeObservability = () => {
  if (initialized) return true;
  if (!env.EXPO_PUBLIC_SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env.EXPO_PUBLIC_APP_ENV,
    sendDefaultPii: false,
    tracesSampleRate: env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    beforeSend: (event) => ({
      ...event,
      user: undefined,
      request: event.request
        ? {
            ...event.request,
            cookies: undefined,
            data: undefined,
            headers: undefined,
            query_string: undefined,
            url: undefined,
          }
        : undefined,
      breadcrumbs: undefined,
    }),
  });
  initialized = true;
  return true;
};

export const reportError = (
  error: unknown,
  context: ErrorReportContext,
): string | undefined => {
  if (!initializeObservability()) return undefined;

  const safeError = new Error(
    context.area === 'api' ? 'API request failed' : 'Application error',
  );
  safeError.name = context.area === 'api' ? 'ApiError' : 'ApplicationError';
  if (error instanceof Error && error.stack) {
    safeError.stack = [
      `${safeError.name}: ${safeError.message}`,
      ...error.stack.split(/\r?\n/u).slice(1),
    ].join('\n');
  }

  return Sentry.captureException(safeError, {
    tags: {
      area: context.area,
      operation: context.operation,
    },
    extra: {
      requestId: context.requestId,
      route: context.route,
      statusCode: context.statusCode,
    },
  });
};

export const resetObservabilityForTests = () => {
  initialized = false;
};
