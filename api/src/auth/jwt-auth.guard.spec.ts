import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const secret = 'test_jwt_secret_123';
  let guard: JwtAuthGuard;
  let previousSecret: string | undefined;

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
    process.env.JWT_SECRET = secret;
    guard = new JwtAuthGuard();
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  });

  it('rejects requests without a bearer token', () => {
    const { context } = contextFor();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects malformed or incorrectly signed tokens', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, 'wrong');
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects tokens missing required user claims', () => {
    const token = jwt.sign({ sub: 'user_1' }, secret);
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects tokens with an empty phone claim', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '' }, secret);

    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects tokens with an empty subject claim', () => {
    const token = jwt.sign({ sub: '', phone: '+2348012345678' }, secret);
    const { context } = contextFor(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('attaches the authenticated user from a valid token', () => {
    const token = jwt.sign({ sub: 'user_1', phone: '+2348012345678' }, secret);
    const { context, req } = contextFor(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({
      userId: 'user_1',
      phone: '+2348012345678',
    });
  });
});
