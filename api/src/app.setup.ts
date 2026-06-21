import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function configureApp(app: INestApplication) {
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
      typeof rawRequestId === 'string' && rawRequestId.length > 0
        ? rawRequestId
        : randomUUID();
    res.setHeader('x-request-id', requestId);
    const started = Date.now();
    res.on('finish', () => {
      logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms requestId=${requestId}`,
      );
    });
    next();
  });
}
