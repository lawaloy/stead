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

  const createResponse = (statusCode: number) => {
    const setHeader = jest.fn();
    const res = Object.assign(new EventEmitter(), {
      setHeader,
      statusCode,
    }) as unknown as Response & EventEmitter;
    return { res, setHeader };
  };

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

  it('configures ValidationPipe with whitelist, transform, and implicit conversion', () => {
    type ConfiguredPipe = ValidationPipe & {
      isTransformEnabled: boolean;
      validatorOptions: { whitelist?: boolean };
      transformOptions: { enableImplicitConversion?: boolean };
    };
    const calls = useGlobalPipes.mock.calls as unknown as ConfiguredPipe[][];
    const pipe = calls[0]?.[0];

    expect(pipe).toBeInstanceOf(ValidationPipe);
    expect(pipe?.isTransformEnabled).toBe(true);
    expect(pipe?.validatorOptions.whitelist).toBe(true);
    expect(pipe?.transformOptions.enableImplicitConversion).toBe(true);
  });

  it('preserves a non-empty x-request-id header on the response', () => {
    const { res, setHeader } = createResponse(200);
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

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'client-trace-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when the header is missing or empty', () => {
    const { res, setHeader } = createResponse(204);
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

    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when x-request-id is a multi-value array', () => {
    const { res, setHeader } = createResponse(200);

    middleware(
      {
        headers: { 'x-request-id': ['a', 'b'] },
        method: 'GET',
        originalUrl: '/',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    expect(setHeader).not.toHaveBeenCalledWith('x-request-id', 'a');
    expect(setHeader).not.toHaveBeenCalledWith('x-request-id', 'b');
    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
  });

  it('logs the completed request with the resolved request id', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { res } = createResponse(201);

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
