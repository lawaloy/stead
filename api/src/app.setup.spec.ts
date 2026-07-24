import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';

describe('configureApp', () => {
  let enableCors: jest.Mock;
  let useGlobalPipes: jest.Mock;
  let use: jest.Mock;
  let middleware: (req: Request, res: Response, next: NextFunction) => void;
  let app: INestApplication;

  beforeEach(() => {
    enableCors = jest.fn();
    useGlobalPipes = jest.fn();
    use = jest.fn((handler: typeof middleware) => {
      middleware = handler;
    });
    app = {
      enableCors,
      useGlobalPipes,
      use,
    } as unknown as INestApplication;

    configureApp(app);
  });

  it('enables CORS reflection, a validation pipe, and request middleware', () => {
    expect(enableCors).toHaveBeenCalledWith({ origin: true });
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(use).toHaveBeenCalledTimes(1);
  });

  it('preserves a non-empty x-request-id header on the response', () => {
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 200,
    }) as unknown as Response & EventEmitter;
    const next = jest.fn();

    middleware(
      {
        headers: { 'x-request-id': 'client-trace-1' },
        method: 'GET',
        originalUrl: '/health',
      } as unknown as Request,
      res,
      next,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'client-trace-1',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when the header is missing or empty', () => {
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 204,
    }) as unknown as Response & EventEmitter;
    const next = jest.fn();

    middleware(
      {
        headers: { 'x-request-id': '' },
        method: 'POST',
        originalUrl: '/auth/request-otp',
      } as unknown as Request,
      res,
      next,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when x-request-id is a multi-value array', () => {
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 200,
    }) as unknown as Response & EventEmitter;

    middleware(
      {
        headers: { 'x-request-id': ['a', 'b'] },
        method: 'GET',
        originalUrl: '/',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    const assigned = (res.setHeader as jest.Mock).mock.calls[0][1] as string;
    expect(assigned).not.toBe('a');
    expect(assigned).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('logs the completed request with the resolved request id', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 201,
    }) as unknown as Response & EventEmitter;

    middleware(
      {
        headers: { 'x-request-id': 'log-trace' },
        method: 'POST',
        originalUrl: '/goals',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    res.emit('finish');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/goals 201 \d+ms requestId=log-trace$/),
    );
    logSpy.mockRestore();
  });
});
