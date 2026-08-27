import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard unsigned tokens', () => {
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

  const encodeJwtPart = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const unsignedToken = (
    payload: Record<string, unknown>,
    alg = 'none',
    signature = '',
  ) =>
    `${encodeJwtPart({ alg, typ: 'JWT' })}.${encodeJwtPart(payload)}.${signature}`;

  const claims = { sub: 'user_1', phone: '+2348012345678' };

  beforeEach(() => {
    guard = new JwtAuthGuard({
      get: jest.fn().mockReturnValue(secret),
    } as never);
  });

  it('rejects alg=none tokens with an empty signature', () => {
    const { context, req } = contextFor(`Bearer ${unsignedToken(claims)}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  it('rejects alg=none tokens even when a dummy signature is present', () => {
    const { context, req } = contextFor(
      `Bearer ${unsignedToken(claims, 'none', 'not-a-signature')}`,
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  it('rejects an empty bearer token instead of attaching a user', () => {
    const { context, req } = contextFor('Bearer ');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });
});
