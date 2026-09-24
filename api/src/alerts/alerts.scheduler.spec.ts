import { Logger } from '@nestjs/common';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AlertsScheduler', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  let prisma: { alertPreference: { findMany: jest.Mock } };
  let alerts: { evaluateUser: jest.Mock };
  let scheduler: AlertsScheduler;
  let errorSpy: jest.SpyInstance;

  const tick = () =>
    (scheduler as unknown as { tick: () => Promise<void> }).tick();

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma = { alertPreference: { findMany: jest.fn() } };
    alerts = { evaluateUser: jest.fn().mockResolvedValue(undefined) };
    scheduler = new AlertsScheduler(
      prisma as unknown as PrismaService,
      alerts as unknown as AlertsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('evaluates only customers with an enabled alert channel', async () => {
    prisma.alertPreference.findMany.mockResolvedValue([
      { userId: 'user_weekly' },
      { userId: 'user_risk' },
    ]);

    await scheduler.run(now);

    expect(prisma.alertPreference.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ weeklySummaryEnabled: true }, { riskAlertsEnabled: true }],
      },
      select: { userId: true },
    });
    expect(alerts.evaluateUser.mock.calls).toEqual([
      ['user_weekly', now],
      ['user_risk', now],
    ]);
  });

  it('skips a tick while a previous evaluation is still running', async () => {
    let release!: () => void;
    prisma.alertPreference.findMany.mockReturnValue(
      new Promise<{ userId: string }[]>((resolve) => {
        release = () => resolve([{ userId: 'user_1' }]);
      }),
    );

    const first = tick();
    const skipped = tick();
    await skipped;
    expect(alerts.evaluateUser).not.toHaveBeenCalled();

    release();
    await first;
    expect(alerts.evaluateUser).toHaveBeenCalledTimes(1);
    expect(alerts.evaluateUser).toHaveBeenCalledWith(
      'user_1',
      expect.any(Date),
    );
  });

  it('allows a later tick after an evaluation failure', async () => {
    prisma.alertPreference.findMany.mockResolvedValue([{ userId: 'user_1' }]);
    alerts.evaluateUser
      .mockRejectedValueOnce(new Error('dashboard unavailable'))
      .mockResolvedValueOnce(undefined);

    await tick();
    await tick();

    expect(alerts.evaluateUser).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      'Readiness alert evaluation failed: dashboard unavailable',
    );
  });
});
