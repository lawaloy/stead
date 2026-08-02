import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperatorGuard } from './operator.guard';

describe('OperatorGuard', () => {
  const contextFor = (user?: { userId: string; phone: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  const guardFor = (operatorUserIds: string | undefined) =>
    new OperatorGuard({
      get: jest.fn().mockReturnValue(operatorUserIds),
    } as never);

  it('defaults to denying access when no operators are configured', () => {
    const guard = guardFor(undefined);

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'user_1', phone: '+2348012345678' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies authenticated users outside the operator allowlist', () => {
    const guard = guardFor('operator_1');

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'user_1', phone: '+2348012345678' }),
      ),
    ).toThrow('Operator access required');
  });

  it('allows configured operator user IDs after trimming entries', () => {
    const guard = guardFor(' operator_1,operator_2, ');

    expect(
      guard.canActivate(
        contextFor({ userId: 'operator_2', phone: '+2348012345678' }),
      ),
    ).toBe(true);
  });

  it('denies requests without an authenticated user', () => {
    const guard = guardFor('operator_1');

    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
