import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard process.env JWT_SECRET ignore', () => {
  const envSecret = 'process-env-jwt-secret-16';
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
      get: jest.fn().mockReturnValue(undefined),
    } as never);
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous;
    }
  });

  it('rejects tokens signed with process.env when ConfigService omits JWT_SECRET', () => {
    const token = jwt.sign(
      { sub: 'user_1', phone: '+2348012345678' },
      envSecret,
    );
    const { context, req } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });
});
