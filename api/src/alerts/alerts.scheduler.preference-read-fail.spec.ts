import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AlertsScheduler preference discovery failure', () => {
  let prisma: { alertPreference: { findMany: jest.Mock } };
  let alerts: { evaluateUser: jest.Mock };
  let scheduler: AlertsScheduler;

  beforeEach(() => {
    prisma = { alertPreference: { findMany: jest.fn() } };
    alerts = { evaluateUser: jest.fn().mockResolvedValue(undefined) };
    scheduler = new AlertsScheduler(
      prisma as unknown as PrismaService,
      alerts as unknown as AlertsService,
    );
  });

  it('does not evaluate users when enabled-preference discovery fails', async () => {
    const now = new Date('2026-09-07T10:00:00.000Z');
    prisma.alertPreference.findMany.mockRejectedValue(
      new Error('preference discovery unavailable'),
    );

    await expect(scheduler.run(now)).rejects.toThrow(
      'preference discovery unavailable',
    );

    expect(prisma.alertPreference.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ weeklySummaryEnabled: true }, { riskAlertsEnabled: true }],
      },
      select: { userId: true },
    });
    expect(alerts.evaluateUser).not.toHaveBeenCalled();
  });
});
