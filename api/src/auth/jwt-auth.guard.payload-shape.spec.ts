import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard payload shape', () => {
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

  beforeEach(() => {
    guard = new JwtAuthGuard({
      get: jest.fn().mockReturnValue(secret),
    } as never);
  });

  it('rejects verified tokens whose payload is not an object', () => {
    const token = jwt.sign('not-an-object', secret);
    const { context, req } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });
});
