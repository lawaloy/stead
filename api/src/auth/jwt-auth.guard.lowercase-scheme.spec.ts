import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard lowercase bearer scheme', () => {
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

  it.each([
    ['lowercase bearer', (token: string) => `bearer ${token}`],
    ['uppercase BEARER', (token: string) => `BEARER ${token}`],
    ['tab after Bearer', (token: string) => `Bearer\t${token}`],
  ])(
    'rejects a valid JWT when the Authorization scheme is %s instead of "Bearer "',
    (_label, headerFor) => {
      const token = jwt.sign(
        { sub: 'user_1', phone: '+2348012345678' },
        secret,
      );
      const { context, req } = contextFor(headerFor(token));

      try {
        guard.canActivate(context);
        throw new Error('expected UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toMatchObject({
          message: 'Missing bearer token',
        });
        expect(req.user).toBeUndefined();
      }
    },
  );
});
