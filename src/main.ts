import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
