import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp non-string metric routes', () => {
  let middleware: (req: Request, res: Response, next: NextFunction) => void;
  let metrics: { recordHttpRequest: jest.Mock };

  const createResponse = (statusCode: number) => {
    const setHeader = jest.fn();
    const res = Object.assign(new EventEmitter(), {
      setHeader,
      statusCode,
    }) as unknown as Response & EventEmitter;
    return { res, setHeader };
  };

  beforeEach(() => {
    metrics = { recordHttpRequest: jest.fn() };
    const app = {
      enableCors: jest.fn(),
      get: jest.fn().mockReturnValue(metrics),
      useGlobalPipes: jest.fn(),
      use: jest.fn((handler: typeof middleware) => {
        middleware = handler;
      }),
      useBodyParser: jest.fn(),
    } as unknown as INestApplication;

    configureApp(app);
  });

  it.each([
    ['regexp', /^\/health/],
    ['array', ['/health', '/ready']],
  ] as const)(
    'labels a %s Express route.path as unmatched in HTTP metrics',
    (_kind, path) => {
      const { res } = createResponse(200);

      middleware(
        {
          headers: {},
          method: 'GET',
          path: '/health',
          route: { path },
        } as unknown as Request,
        res,
        jest.fn(),
      );

      res.emit('finish');

      expect(metrics.recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({ route: 'unmatched' }),
      );
    },
  );
});
