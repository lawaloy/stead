import { AlertsService } from './alerts.service';

describe('AlertsService upsert failure after publish', () => {
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

  it('propagates alertState upsert failure after a weekly SMS is already queued', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      user: { phone: '+2348012345678' },
    });
    dashboard.getStability.mockResolvedValue({
      ok: true,
      goal: { id: 'goal_1', name: 'Rent' },
      metrics: {
        readinessPct: 40,
        status: 'stable',
        stabilityScore: 72,
        paceRequiredMonthlyKobo: 1_000_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue(null);
    prisma.alertState.upsert.mockRejectedValue(
      new Error('alert state unavailable'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'alert state unavailable',
    );

    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'weekly.summary',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      payload: {
        phone: '+2348012345678',
        body: 'Stead weekly: Rent is 40% ready, status stable, score 72. Required monthly pace: ₦10,000.',
      },
    });
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          where: { userId_goalId: { userId: string; goalId: string } };
          create: {
            userId: string;
            goalId: string;
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus: string | null;
            lastNotifiedScore: number | null;
            lastRiskAlertAt: Date | null;
            lastRecoveryAlertAt: Date | null;
            lastWeeklySummaryAt: Date | null;
            lastWeeklySummaryKey: string | null;
          };
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastWeeklySummaryAt?: Date;
            lastWeeklySummaryKey?: string;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].where).toEqual({
      userId_goalId: { userId: 'user_1', goalId: 'goal_1' },
    });
    expect(upsertCalls[0]?.[0].create).toEqual({
      userId: 'user_1',
      goalId: 'goal_1',
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
      lastNotifiedStatus: null,
      lastNotifiedScore: null,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
    });
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
    });
  });
});
