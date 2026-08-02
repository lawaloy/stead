import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard default secret fallback', () => {
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
      get: jest.fn().mockReturnValue(undefined),
    } as never);
  });

  it('rejects the former hard-coded fallback when JWT_SECRET is unset', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      'change_me_now',
    );
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects all signed tokens when JWT_SECRET is unset', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      'some_other_secret',
    );
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
