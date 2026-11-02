import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { configureApp } from './app.setup';
import {
  getCorrelationId,
  getOperationId,
  getOperationName,
} from './observability/request-context';

describe('configureApp', () => {
  let enableCors: jest.Mock;
  let useGlobalPipes: jest.Mock;
  let use: jest.Mock;
  let useBodyParser: jest.Mock;
  let metrics: { recordHttpRequest: jest.Mock };
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
    useBodyParser = jest.fn();
    metrics = { recordHttpRequest: jest.fn() };
    app = {
      enableCors,
      get: jest.fn().mockReturnValue(metrics),
      useGlobalPipes,
      use,
      useBodyParser,
    } as unknown as INestApplication;

    configureApp(app);
  });

  it('sets a bounded JSON limit, CORS, validation, and request middleware', () => {
    expect(useBodyParser).toHaveBeenCalledWith('json', { limit: '1mb' });
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

    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'client-trace-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses the resolved request id as every HTTP request operation id', () => {
    const { res } = createResponse(200);
    let observedContext: Record<string, string | undefined> = {};

    middleware(
      {
        headers: { 'x-request-id': 'client-trace-1' },
        method: 'GET',
        originalUrl: '/health',
      } as unknown as Request,
      res,
      () => {
        observedContext = {
          correlationId: getCorrelationId(),
          operationId: getOperationId(),
          operationName: getOperationName(),
        };
      },
    );

    expect(observedContext).toEqual({
      correlationId: 'client-trace-1',
      operationId: 'client-trace-1',
      operationName: 'http.request',
    });
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
      'X-Request-ID',
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

    expect(setHeader).not.toHaveBeenCalledWith('X-Request-ID', 'a');
    expect(setHeader).not.toHaveBeenCalledWith('X-Request-ID', 'b');
    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
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
        baseUrl: '',
        method: 'POST',
        originalUrl: '/goals',
        path: '/goals',
        route: { path: '/goals' },
      } as unknown as Request,
      res,
      jest.fn(),
    );

    res.emit('finish');

    expect(logSpy).toHaveBeenCalledWith('HTTP request completed', {
      durationMs: expect.any(Number) as unknown,
      method: 'POST',
      path: '/goals',
      requestId: 'log-trace',
      statusCode: 201,
    });
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith({
      durationMs: expect.any(Number) as unknown,
      method: 'POST',
      route: '/goals',
      statusCode: 201,
    });
    logSpy.mockRestore();
  });

  it('removes resource identifiers from the logged request path', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { res } = createResponse(200);

    middleware(
      {
        headers: {},
        method: 'GET',
        path: '/goals/123e4567-e89b-42d3-a456-426614174000',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    res.emit('finish');

    expect(logSpy).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({ path: '/goals/:id' }),
    );
    logSpy.mockRestore();
  });

  it('uses matched route templates and a fixed unmatched metric fallback', () => {
    const first = createResponse(200);
    middleware(
      {
        baseUrl: '',
        headers: {},
        method: 'GET',
        path: '/goals/customer-controlled-id',
        route: { path: '/goals/:id' },
      } as unknown as Request,
      first.res,
      jest.fn(),
    );
    first.res.emit('finish');

    const second = createResponse(404);
    middleware(
      {
        baseUrl: '',
        headers: {},
        method: 'GET',
        path: '/missing/customer-controlled-id',
      } as unknown as Request,
      second.res,
      jest.fn(),
    );
    second.res.emit('finish');

    expect(metrics.recordHttpRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ route: '/goals/:id' }),
    );
    expect(metrics.recordHttpRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ route: 'unmatched' }),
    );
  });

  it('replaces unsafe client request ids', () => {
    const { res, setHeader } = createResponse(200);

    middleware(
      {
        headers: { 'x-request-id': 'unsafe\nheader' },
        method: 'GET',
        path: '/',
      } as unknown as Request,
      res,
      jest.fn(),
    );

    expect(setHeader).not.toHaveBeenCalledWith(
      'X-Request-ID',
      'unsafe\nheader',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });
});
