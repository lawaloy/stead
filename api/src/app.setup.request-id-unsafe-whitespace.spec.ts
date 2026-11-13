import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp unsafe whitespace request ids', () => {
  let middleware: (req: Request, res: Response, next: NextFunction) => void;

  const createResponse = (statusCode: number) => {
    const setHeader = jest.fn();
    const res = Object.assign(new EventEmitter(), {
      setHeader,
      statusCode,
    }) as unknown as Response & EventEmitter;
    return { res, setHeader };
  };

  beforeEach(() => {
    const app = {
      enableCors: jest.fn(),
      get: jest.fn().mockReturnValue({ recordHttpRequest: jest.fn() }),
      useGlobalPipes: jest.fn(),
      use: jest.fn((handler: typeof middleware) => {
        middleware = handler;
      }),
      useBodyParser: jest.fn(),
    } as unknown as INestApplication;

    configureApp(app);
  });

  it.each(['client trace', 'client\ttrace', 'client\rtrace'])(
    'replaces a client request id containing whitespace %j',
    (requestId) => {
      const { res, setHeader } = createResponse(200);

      middleware(
        {
          headers: { 'x-request-id': requestId },
          method: 'GET',
          path: '/',
        } as unknown as Request,
        res,
        jest.fn(),
      );

      expect(setHeader).not.toHaveBeenCalledWith('X-Request-ID', requestId);
      expect(setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      );
    },
  );
});
