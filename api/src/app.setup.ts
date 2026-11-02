import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import {
  OBSERVABILITY_METRICS,
  type ObservabilityMetrics,
} from './observability/metrics';
import { runWithRequestId } from './observability/request-context';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID_PATH_SEGMENT =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const safeRequestPath = (path: string) =>
  path.replace(UUID_PATH_SEGMENT, ':id');

const metricRoute = (req: Request) => {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath !== 'string') return 'unmatched';
  return routePath || '/';
};

export function configureApp(app: INestApplication) {
  const expressApp = app as INestApplication & {
    useBodyParser: (type: 'json', options: { limit: string }) => void;
  };
  expressApp.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: true,
  });

  const logger = new Logger('HTTP');
  const metrics = app.get<ObservabilityMetrics>(OBSERVABILITY_METRICS);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rawRequestId = req.headers['x-request-id'];
    const requestId =
      typeof rawRequestId === 'string' && SAFE_REQUEST_ID.test(rawRequestId)
        ? rawRequestId
        : randomUUID();
    res.setHeader('x-request-id', requestId);
    const started = performance.now();
    res.on('finish', () => {
      runWithRequestId(requestId, () => {
        const path = safeRequestPath(req.path);
        const route = metricRoute(req);
        const durationMs = performance.now() - started;
        logger.log('HTTP request completed', {
          requestId,
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs,
        });
        metrics.recordHttpRequest({
          method: req.method,
          route,
          statusCode: res.statusCode,
          durationMs,
        });
      });
    });
    runWithRequestId(requestId, next);
  });
}
