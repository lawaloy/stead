import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperatorGuard } from './operator.guard';

describe('OperatorGuard numeric user IDs', () => {
  const contextFor = (user?: { userId: unknown; phone: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  const guardFor = (operatorUserIds: string | undefined) =>
    new OperatorGuard({
      get: jest.fn().mockReturnValue(operatorUserIds),
    } as never);

  it('denies numeric JWT subjects that stringify-match the allowlist and allows the string id', () => {
    const guard = guardFor('123');

    expect(() =>
      guard.canActivate(contextFor({ userId: 123, phone: '+2348012345678' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor({ userId: 123, phone: '+2348012345678' })),
    ).toThrow('Operator access required');

    expect(
      guard.canActivate(contextFor({ userId: '123', phone: '+2348012345678' })),
    ).toBe(true);
  });
});
