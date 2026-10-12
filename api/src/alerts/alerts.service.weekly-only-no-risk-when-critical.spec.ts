import { AlertsService } from './alerts.service';

describe('AlertsService weekly-only does not alert on current critical metrics', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const lastRiskAlertAt = new Date('2026-09-06T10:00:00.000Z');
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

  it('publishes the weekly summary without a risk SMS when risk alerts are off', async () => {
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
        readinessPct: 10,
        status: 'critical',
        stabilityScore: 20,
        paceRequiredMonthlyKobo: 1_000_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastWeeklySummaryKey: null,
      lastWeeklySummaryAt: null,
      lastNotifiedStatus: 'stable',
      lastNotifiedScore: 80,
      lastRiskAlertAt,
      lastRecoveryAlertAt: null,
    });
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'weekly.summary',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      payload: {
        phone: '+2348012345678',
        body: 'Stead weekly: Rent is 10% ready, status critical, score 20. Required monthly pace: ₦10,000.',
      },
    });
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'risk.alert' }),
    );
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'risk.recovery' }),
    );

    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          create: {
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
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRiskAlertAt?: Date;
            lastRecoveryAlertAt?: Date;
            lastWeeklySummaryAt?: Date;
            lastWeeklySummaryKey?: string;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].create).toEqual({
      userId: 'user_1',
      goalId: 'goal_1',
      lastObservedStatus: 'critical',
      lastObservedScore: 20,
      lastNotifiedStatus: null,
      lastNotifiedScore: null,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
    });
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'critical',
      lastObservedScore: 20,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
    });
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedStatus');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedScore');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastRiskAlertAt');
  });
});
