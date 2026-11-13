import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard extra space after the Bearer scheme', () => {
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

  it('rejects a valid JWT when a second space follows the Bearer scheme', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, secret);
    const { context, req } = contextFor(`Bearer  ${token}`);

    expectUnauthorized(context, 'Invalid token', req);
  });

  it('rejects a valid JWT when the credential has a trailing space', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, secret);
    const { context, req } = contextFor(`Bearer ${token} `);

    expectUnauthorized(context, 'Invalid token', req);
  });
});
