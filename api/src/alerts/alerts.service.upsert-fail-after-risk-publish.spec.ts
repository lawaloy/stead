import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService upsert failure after risk-only publish', () => {
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

  it('propagates alertState upsert failure after a risk SMS is already queued', async () => {
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
        readinessPct: 30,
        status: 'warning',
        stabilityScore: 55,
        paceRequiredMonthlyKobo: 700_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastNotifiedStatus: 'stable',
      lastNotifiedScore: 80,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
    });
    prisma.alertState.upsert.mockRejectedValue(
      new Error('alert state unavailable'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'alert state unavailable',
    );

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'risk.alert',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: alertOccurrenceKey({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_1',
        previousStatus: 'stable',
        previousScore: 80,
        currentStatus: 'warning',
        currentScore: 55,
        lastRiskAlertAt: null,
        lastRecoveryAlertAt: null,
      }),
      payload: {
        phone: '+2348012345678',
        body: 'Stead alert: Rent moved to warning (score 55). Review recent spending and your required savings pace.',
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
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRiskAlertAt?: Date;
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
      lastObservedStatus: 'warning',
      lastObservedScore: 55,
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 55,
      lastRiskAlertAt: now,
      lastRecoveryAlertAt: null,
      lastWeeklySummaryAt: null,
      lastWeeklySummaryKey: null,
    });
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'warning',
      lastObservedScore: 55,
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 55,
      lastRiskAlertAt: now,
    });
  });
});
