import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService weekly not-due still evaluates first risk', () => {
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

  it('still publishes first-observation risk when the weekly window is not due yet', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: true,
      timeZone: 'America/Los_Angeles',
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
      lastWeeklySummaryKey: null,
      lastWeeklySummaryAt: null,
      lastNotifiedStatus: null,
      lastNotifiedScore: null,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
    });
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'risk.alert',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: alertOccurrenceKey({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_1',
        previousStatus: null,
        previousScore: null,
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
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'weekly.summary' }),
    );
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'risk.recovery' }),
    );

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
      lastObservedStatus: 'warning',
      lastObservedScore: 55,
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 55,
      lastRiskAlertAt: now,
    });
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryKey',
    );
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryAt',
    );
  });
});
