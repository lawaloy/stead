import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard empty vs whitespace JWT_SECRET', () => {
  const claims = { sub: 'user_1', phone: '+2348012345678' };
  const realSecret = 'test_jwt_secret_123';
  const whitespaceSecret = ' \t\n ';

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

  const guardFor = (secret: string) =>
    new JwtAuthGuard({
      get: jest.fn().mockReturnValue(secret),
    } as never);

  it('treats an empty JWT_SECRET as missing and verifies with a whitespace-only secret', () => {
    const realToken = jwt.sign(claims, realSecret);
    const whitespaceToken = jwt.sign(claims, whitespaceSecret);

    const emptyGuard = guardFor('');
    const { context: emptyContext, req: emptyReq } = contextFor(
      `Bearer ${realToken}`,
    );

    expect(() => emptyGuard.canActivate(emptyContext)).toThrow(
      UnauthorizedException,
    );
    expect(emptyReq.user).toBeUndefined();

    const whitespaceGuard = guardFor(whitespaceSecret);
    const { context: rejectedContext, req: rejectedReq } = contextFor(
      `Bearer ${realToken}`,
    );

    expect(() => whitespaceGuard.canActivate(rejectedContext)).toThrow(
      'Invalid token',
    );
    expect(rejectedReq.user).toBeUndefined();

    const { context: acceptedContext, req: acceptedReq } = contextFor(
      `Bearer ${whitespaceToken}`,
    );

    expect(whitespaceGuard.canActivate(acceptedContext)).toBe(true);
    expect(acceptedReq.user).toEqual({
      userId: 'user_1',
      phone: '+2348012345678',
    });
  });
});
