import { AlertsService } from './alerts.service';

describe('AlertsService upsert failure without a publish', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  let prisma: {
    alertPreference: { findUnique: jest.Mock };
    alertState: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let notifications: { publishReadinessAlert: jest.Mock };
  let dashboard: { getStability: jest.Mock };
  let service: AlertsService;

  beforeEach(() => {
    prisma = {
      alertPreference: { findUnique: jest.fn() },
      alertState: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    notifications = {
      publishReadinessAlert: jest.fn().mockResolvedValue(true),
    };
    dashboard = { getStability: jest.fn() };
    service = new AlertsService(
      prisma as never,
      notifications as never,
      dashboard as never,
    );
  });

  it('does not treat a first-stable baseline tick as success when alert state persist fails', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: false,
      riskAlertsEnabled: true,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      user: { phone: '+2348012345678' },
    });
    dashboard.getStability.mockResolvedValue({
      ok: true,
      goal: { id: 'goal_1', name: 'Rent' },
      metrics: {
        readinessPct: 62,
        status: 'stable',
        stabilityScore: 80,
        paceRequiredMonthlyKobo: 500_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue(null);
    const failure = new Error('alert state persist unavailable');
    prisma.alertState.upsert.mockRejectedValue(failure);

    await expect(service.evaluateUser('user_1', now)).rejects.toBe(failure);

    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).toHaveBeenCalledTimes(1);
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          where: { userId_goalId: { userId: string; goalId: string } };
          create: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus: string | null;
            lastNotifiedScore: number | null;
            lastRiskAlertAt: Date | null;
            lastRecoveryAlertAt: Date | null;
          };
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].where).toEqual({
      userId_goalId: { userId: 'user_1', goalId: 'goal_1' },
    });
    expect(upsertCalls[0]?.[0].create).toMatchObject({
      lastObservedStatus: 'stable',
      lastObservedScore: 80,
      lastNotifiedStatus: 'stable',
      lastNotifiedScore: 80,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
    });
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 80,
      lastNotifiedStatus: 'stable',
      lastNotifiedScore: 80,
    });
  });
});
