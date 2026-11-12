import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard not-before tokens', () => {
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

  it('rejects future-dated tokens as invalid instead of session-expired', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, secret, {
      notBefore: 60,
    });
    const { context, req } = contextFor(`Bearer ${token}`);

    try {
      guard.canActivate(context);
      throw new Error('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        message: 'Invalid token',
      });
      expect((error as UnauthorizedException).getResponse()).not.toEqual({
        message: 'Session expired',
        code: 'SESSION_EXPIRED',
      });
      expect(req.user).toBeUndefined();
    }
  });
});
