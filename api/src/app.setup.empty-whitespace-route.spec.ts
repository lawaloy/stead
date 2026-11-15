import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp empty vs whitespace metric routes', () => {
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

  it('labels an empty route path as / and keeps a whitespace-only path as its own metric', () => {
    const empty = createResponse(200);
    middleware(
      {
        headers: {},
        method: 'GET',
        path: '/',
        route: { path: '' },
      } as unknown as Request,
      empty.res,
      jest.fn(),
    );
    empty.res.emit('finish');

    const whitespace = createResponse(200);
    middleware(
      {
        headers: {},
        method: 'GET',
        path: '/',
        route: { path: ' \t\n ' },
      } as unknown as Request,
      whitespace.res,
      jest.fn(),
    );
    whitespace.res.emit('finish');

    expect(metrics.recordHttpRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ route: '/' }),
    );
    expect(metrics.recordHttpRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ route: ' \t\n ' }),
    );
  });
});
