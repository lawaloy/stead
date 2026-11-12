import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp request id bound', () => {
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

  it('preserves a 128-character safe client request id', () => {
    const requestId = 'a'.repeat(128);
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

    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', requestId);
  });

  it('replaces a client request id longer than 128 characters', () => {
    const requestId = 'a'.repeat(129);
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
  });

  it('labels empty matched routes as / in HTTP metrics', () => {
    const { res } = createResponse(200);

    middleware(
      {
        headers: {},
        method: 'GET',
        path: '/',
        route: { path: '' },
      } as unknown as Request,
      res,
      jest.fn(),
    );

    res.emit('finish');

    expect(metrics.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/' }),
    );
  });
});
