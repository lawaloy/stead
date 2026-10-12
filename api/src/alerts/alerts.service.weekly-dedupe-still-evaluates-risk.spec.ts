import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService weekly queue dedupe still evaluates risk', () => {
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
      publishReadinessAlert: jest.fn(),
    };
    dashboard = { getStability: jest.fn() };
    service = new AlertsService(
      prisma as never,
      notifications as never,
      dashboard as never,
    );
  });

  it('still publishes a material risk SMS when weekly enqueue reports a dedupe miss', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
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
        readinessPct: 0,
        status: 'critical',
        stabilityScore: 0,
        paceRequiredMonthlyKobo: 1_000_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue(null);
    notifications.publishReadinessAlert
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(2);
    expect(notifications.publishReadinessAlert).toHaveBeenNthCalledWith(1, {
      type: 'weekly.summary',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      payload: {
        phone: '+2348012345678',
        body: 'Stead weekly: Rent is 0% ready, status critical, score 0. Required monthly pace: ₦10,000.',
      },
    });
    expect(notifications.publishReadinessAlert).toHaveBeenNthCalledWith(2, {
      type: 'risk.alert',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: alertOccurrenceKey({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_1',
        previousStatus: null,
        previousScore: null,
        currentStatus: 'critical',
        currentScore: 0,
        lastRiskAlertAt: null,
        lastRecoveryAlertAt: null,
      }),
      payload: {
        phone: '+2348012345678',
        body: 'Stead alert: Rent moved to critical (score 0). Review recent spending and your required savings pace.',
      },
    });

    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRiskAlertAt?: Date;
            lastWeeklySummaryKey?: string;
            lastWeeklySummaryAt?: Date;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'critical',
      lastObservedScore: 0,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
      lastNotifiedStatus: 'critical',
      lastNotifiedScore: 0,
      lastRiskAlertAt: now,
    });
  });
});
