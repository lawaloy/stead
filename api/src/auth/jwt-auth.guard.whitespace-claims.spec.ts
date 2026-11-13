import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard empty vs whitespace identity claims', () => {
  const secret = 'test_jwt_secret_123';
  const whitespaceClaim = ' \t\n ';
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

  it('rejects empty subject and phone claims and authenticates whitespace-only claims', () => {
    const emptySub = jwt.sign({ sub: '', phone: '+2348012345678' }, secret);
    const { context: emptySubContext, req: emptySubReq } = contextFor(
      `Bearer ${emptySub}`,
    );

    expect(() => guard.canActivate(emptySubContext)).toThrow(
      UnauthorizedException,
    );
    expect(emptySubReq.user).toBeUndefined();

    const emptyPhone = jwt.sign({ sub: 'user_1', phone: '' }, secret);
    const { context: emptyPhoneContext, req: emptyPhoneReq } = contextFor(
      `Bearer ${emptyPhone}`,
    );

    expect(() => guard.canActivate(emptyPhoneContext)).toThrow(
      'Invalid token payload',
    );
    expect(emptyPhoneReq.user).toBeUndefined();

    const whitespaceSub = jwt.sign(
      { sub: whitespaceClaim, phone: '+2348012345678' },
      secret,
    );
    const { context: whitespaceSubContext, req: whitespaceSubReq } = contextFor(
      `Bearer ${whitespaceSub}`,
    );

    expect(guard.canActivate(whitespaceSubContext)).toBe(true);
    expect(whitespaceSubReq.user).toEqual({
      userId: whitespaceClaim,
      phone: '+2348012345678',
    });

    const whitespacePhone = jwt.sign(
      { sub: 'user_1', phone: whitespaceClaim },
      secret,
    );
    const { context: whitespacePhoneContext, req: whitespacePhoneReq } =
      contextFor(`Bearer ${whitespacePhone}`);

    expect(guard.canActivate(whitespacePhoneContext)).toBe(true);
    expect(whitespacePhoneReq.user).toEqual({
      userId: 'user_1',
      phone: whitespaceClaim,
    });
  });
});
