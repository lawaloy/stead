import { Logger } from '@nestjs/common';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';

describe('AlertsScheduler tick preference discovery failure', () => {
  let prisma: { alertPreference: { findMany: jest.Mock } };
  let alerts: { evaluateUser: jest.Mock };
  let scheduler: AlertsScheduler;
  let errorSpy: jest.SpyInstance;

  const tick = () =>
    (scheduler as unknown as { tick: () => Promise<void> }).tick();

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma = { alertPreference: { findMany: jest.fn() } };
    alerts = { evaluateUser: jest.fn().mockResolvedValue(undefined) };
    scheduler = new AlertsScheduler(
      prisma as never,
      alerts as unknown as AlertsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a preference discovery failure on tick and allows the next tick', async () => {
    prisma.alertPreference.findMany
      .mockRejectedValueOnce(new Error('preference discovery unavailable'))
      .mockResolvedValueOnce([{ userId: 'user_1' }]);

    await expect(tick()).resolves.toBeUndefined();

    expect(alerts.evaluateUser).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Readiness alert evaluation failed', {
      errorName: 'Error',
    });

    await tick();

    expect(alerts.evaluateUser).toHaveBeenCalledTimes(1);
    expect(alerts.evaluateUser).toHaveBeenCalledWith(
      'user_1',
      expect.any(Date),
    );
  });
});
