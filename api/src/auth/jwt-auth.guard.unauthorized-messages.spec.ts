import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard unauthorized messages', () => {
  const secret = 'test_jwt_secret_123';
  let guard: JwtAuthGuard;

  const contextFor = (authorization?: string) => {
    const req: { headers: { authorization?: string }; user?: unknown } = {
      headers: {},
    };
    if (authorization) req.headers.authorization = authorization;

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as ExecutionContext;

    return { context, req };
  };

  const expectUnauthorized = (
    context: ExecutionContext,
    message: string,
    req: { user?: unknown },
  ) => {
    try {
      guard.canActivate(context);
      throw new Error('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        message,
      });
      expect(req.user).toBeUndefined();
    }
  };

  beforeEach(() => {
    guard = new JwtAuthGuard({
      get: jest.fn().mockReturnValue(secret),
    } as never);
  });

  it('rejects requests without a bearer token using a stable missing-token message', () => {
    const { context, req } = contextFor();
    expectUnauthorized(context, 'Missing bearer token', req);
  });

  it('rejects non-bearer authorization schemes using the missing-token message', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, secret);
    const { context, req } = contextFor(`Basic ${token}`);
    expectUnauthorized(context, 'Missing bearer token', req);
  });

  it('rejects tokens missing required claims using the invalid-payload message', () => {
    const token = jwt.sign({ sub: 'user_1' }, secret);
    const { context, req } = contextFor(`Bearer ${token}`);
    expectUnauthorized(context, 'Invalid token payload', req);
  });

  it('rejects incorrectly signed tokens using the invalid-token message', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      'wrong-secret',
    );
    const { context, req } = contextFor(`Bearer ${token}`);
    expectUnauthorized(context, 'Invalid token', req);
  });
});
