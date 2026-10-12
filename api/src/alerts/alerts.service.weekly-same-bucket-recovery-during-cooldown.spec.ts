import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService weekly same-bucket skip plus recovery during risk cooldown', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const lastRiskAlertAt = new Date('2026-09-07T09:00:00.000Z');
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

  it('still publishes recovery after the weekly bucket was sent without rewriting lastRiskAlertAt', async () => {
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
        readinessPct: 40,
        status: 'stable',
        stabilityScore: 72,
        paceRequiredMonthlyKobo: 500_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastWeeklySummaryKey: '2026-09-06',
      lastWeeklySummaryAt: new Date('2026-09-07T08:00:00.000Z'),
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 55,
      lastRiskAlertAt,
      lastRecoveryAlertAt: null,
    });
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'risk.recovery',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: alertOccurrenceKey({
        type: 'risk.recovery',
        userId: 'user_1',
        goalId: 'goal_1',
        previousStatus: 'warning',
        previousScore: 55,
        currentStatus: 'stable',
        currentScore: 72,
        lastRiskAlertAt,
        lastRecoveryAlertAt: null,
      }),
      payload: {
        phone: '+2348012345678',
        body: 'Stead update: Rent has recovered to stable (score 72). Keep up your current savings pace.',
      },
    });
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'weekly.summary' }),
    );
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'risk.alert' }),
    );

    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRecoveryAlertAt?: Date;
            lastRiskAlertAt?: Date;
            lastWeeklySummaryKey?: string;
            lastWeeklySummaryAt?: Date;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
      lastNotifiedStatus: 'stable',
      lastNotifiedScore: 72,
      lastRecoveryAlertAt: now,
    });
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastRiskAlertAt');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryKey',
    );
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryAt',
    );
  });
});
