import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard default secret fallback', () => {
  let previousSecret: string | undefined;
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
    previousSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    guard = new JwtAuthGuard();
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  });

  it('accepts tokens signed with the hard-coded fallback when JWT_SECRET is unset', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      'change_me_now',
    );
    const { context, req } = contextFor(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({
      userId: 'user_1',
      phone: '+2348012345678',
    });
  });

  it('rejects tokens signed with a different secret when JWT_SECRET is unset', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      'some_other_secret',
    );
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
