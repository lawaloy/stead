import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithCorrelationId } from './observability/request-context';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID_PATH_SEGMENT =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const safeRequestPath = (path: string) =>
  path.replace(UUID_PATH_SEGMENT, ':id');

export function configureApp(app: INestApplication) {
  const expressApp = app as INestApplication & {
    useBodyParser: (type: 'json', options: { limit: string }) => void;
  };
  expressApp.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: true,
  });

  const logger = new Logger('HTTP');
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
    const started = Date.now();
    res.on('finish', () => {
      logger.log('HTTP request completed', {
        requestId,
        method: req.method,
        path: safeRequestPath(req.path),
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
      });
    });
    runWithCorrelationId(requestId, next);
  });
}
