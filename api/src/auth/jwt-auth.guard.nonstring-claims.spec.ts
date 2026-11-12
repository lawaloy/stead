import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard non-string identity claims', () => {
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

  it('rejects falsy non-string claims and authenticates truthy non-string identity values', () => {
    const zeroSub = jwt.sign({ sub: 0, phone: '+2348012345678' }, secret);
    const { context: zeroSubContext, req: zeroSubReq } = contextFor(
      `Bearer ${zeroSub}`,
    );

    expect(() => guard.canActivate(zeroSubContext)).toThrow(
      UnauthorizedException,
    );
    expect(zeroSubReq.user).toBeUndefined();

    const falsePhone = jwt.sign({ sub: 'user_1', phone: false }, secret);
    const { context: falsePhoneContext, req: falsePhoneReq } = contextFor(
      `Bearer ${falsePhone}`,
    );

    expect(() => guard.canActivate(falsePhoneContext)).toThrow(
      'Invalid token payload',
    );
    expect(falsePhoneReq.user).toBeUndefined();

    const numericSub = jwt.sign({ sub: 123, phone: '+2348012345678' }, secret);
    const { context: numericSubContext, req: numericSubReq } = contextFor(
      `Bearer ${numericSub}`,
    );

    expect(guard.canActivate(numericSubContext)).toBe(true);
    expect(numericSubReq.user).toEqual({
      userId: 123,
      phone: '+2348012345678',
    });

    const numericPhone = jwt.sign(
      { sub: 'user_1', phone: 2348012345678 },
      secret,
    );
    const { context: numericPhoneContext, req: numericPhoneReq } = contextFor(
      `Bearer ${numericPhone}`,
    );

    expect(guard.canActivate(numericPhoneContext)).toBe(true);
    expect(numericPhoneReq.user).toEqual({
      userId: 'user_1',
      phone: 2348012345678,
    });
  });
});
