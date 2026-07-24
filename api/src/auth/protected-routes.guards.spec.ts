import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DashboardController } from '../dashboard/dashboard.controller';
import { GoalsController } from '../goals/goals.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { TransactionsController } from '../transactions/transactions.controller';

function guardsFor(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[]) ?? [];
}

function methodGuards(prototype: object, methodName: string): unknown[] {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
  if (!descriptor || typeof descriptor.value !== 'function') {
    return [];
  }
  return guardsFor(descriptor.value as object);
}

describe('protected route JwtAuthGuard wiring', () => {
  it('binds JwtAuthGuard on finance and notifications controllers', () => {
    expect(guardsFor(GoalsController)).toEqual([JwtAuthGuard]);
    expect(guardsFor(TransactionsController)).toEqual([JwtAuthGuard]);
    expect(guardsFor(DashboardController)).toEqual([JwtAuthGuard]);
    expect(guardsFor(NotificationsController)).toEqual([JwtAuthGuard]);
  });

  it('guards auth inspection while leaving OTP and countries public', () => {
    expect(guardsFor(AuthController)).toEqual([]);
    expect(methodGuards(AuthController.prototype, 'requestOtp')).toEqual([]);
    expect(methodGuards(AuthController.prototype, 'verifyOtp')).toEqual([]);
    expect(methodGuards(AuthController.prototype, 'getCountries')).toEqual([]);
    expect(methodGuards(AuthController.prototype, 'getInspection')).toEqual([
      JwtAuthGuard,
    ]);
  });
});
