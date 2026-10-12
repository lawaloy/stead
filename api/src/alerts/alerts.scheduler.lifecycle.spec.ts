import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AlertsScheduler module lifecycle', () => {
  let prisma: { alertPreference: { findMany: jest.Mock } };
  let alerts: { evaluateUser: jest.Mock };
  let scheduler: AlertsScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = { alertPreference: { findMany: jest.fn() } };
    alerts = { evaluateUser: jest.fn().mockResolvedValue(undefined) };
    scheduler = new AlertsScheduler(
      prisma as unknown as PrismaService,
      alerts as unknown as AlertsService,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });

  it('evaluates on module init, repeats every 60s, and stops after destroy', async () => {
    prisma.alertPreference.findMany.mockResolvedValue([{ userId: 'user_1' }]);

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    expect(alerts.evaluateUser).toHaveBeenCalledTimes(1);
    expect(alerts.evaluateUser).toHaveBeenCalledWith(
      'user_1',
      expect.any(Date),
    );

    await jest.advanceTimersByTimeAsync(60_000);
    expect(alerts.evaluateUser).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(alerts.evaluateUser).toHaveBeenCalledTimes(2);
  });
});
