import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperatorGuard } from './operator.guard';

describe('OperatorGuard process.env AUTH_INSPECTION_OPERATOR_USER_IDS ignore', () => {
  const envKey = 'AUTH_INSPECTION_OPERATOR_USER_IDS';
  let previous: string | undefined;

  const contextFor = (user?: { userId: string; phone: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    previous = process.env[envKey];
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('denies operators listed only on process.env when ConfigService omits the allowlist', () => {
    process.env[envKey] = 'operator_1';
    const guard = new OperatorGuard({
      get: jest.fn().mockReturnValue(undefined),
    } as never);

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'operator_1', phone: '+2348012345678' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('uses the ConfigService allowlist even when process.env lists a different operator', () => {
    process.env[envKey] = 'operator_env';
    const guard = new OperatorGuard({
      get: jest.fn().mockReturnValue('operator_config'),
    } as never);

    expect(() =>
      guard.canActivate(
        contextFor({ userId: 'operator_env', phone: '+2348012345678' }),
      ),
    ).toThrow('Operator access required');
    expect(
      guard.canActivate(
        contextFor({ userId: 'operator_config', phone: '+2348012345678' }),
      ),
    ).toBe(true);
  });
});
