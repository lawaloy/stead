import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperatorGuard } from './operator.guard';

describe('OperatorGuard allowlist edges', () => {
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

  it('denies everyone when the allowlist env default is an empty string', () => {
    const guard = guardFor('');

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'user_1', phone: '+2348012345678' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies everyone when the allowlist is only commas and whitespace', () => {
    const guard = guardFor(' , , ');

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'user_1', phone: '+2348012345678' }),
      ),
    ).toThrow('Operator access required');
  });
});
