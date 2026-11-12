import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard process.env JWT_SECRET mismatch', () => {
  const configSecret = 'config-jwt-secret-16';
  const envSecret = 'process-env-jwt-secret-16';
  const claims = { sub: 'user_1', phone: '+2348012345678' };
  let guard: JwtAuthGuard;
  let previous: string | undefined;

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
    previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = envSecret;
    guard = new JwtAuthGuard({
      get: jest.fn().mockReturnValue(configSecret),
    } as never);
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous;
    }
  });

  it('accepts tokens signed with ConfigService even when process.env has a different secret', () => {
    const token = jwt.sign(claims, configSecret);
    const { context, req } = contextFor(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({
      userId: 'user_1',
      phone: '+2348012345678',
    });
  });

  it('rejects tokens signed with process.env when ConfigService has a different secret', () => {
    const token = jwt.sign(claims, envSecret);
    const { context, req } = contextFor(`Bearer ${token}`);

    try {
      guard.canActivate(context);
      throw new Error('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        message: 'Invalid token',
      });
      expect(req.user).toBeUndefined();
    }
  });
});
