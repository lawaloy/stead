import { Logger, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp multi-segment path redaction', () => {
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

  it('redacts every UUID path segment, including uppercase identifiers', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { res } = createResponse(200);

    middleware(
      {
        headers: {},
        method: 'GET',
        path: '/users/123e4567-e89b-42d3-a456-426614174000/goals/123E4567-E89B-42D3-A456-426614174001',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    res.emit('finish');

    expect(logSpy).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({ path: '/users/:id/goals/:id' }),
    );
    logSpy.mockRestore();
  });
});
