import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService first deterioration after a stable baseline', () => {
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

  it('publishes one risk alert when a seeded stable baseline moves to warning', async () => {
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
          update: {
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRiskAlertAt?: Date;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].update.lastNotifiedStatus).toBe('warning');
    expect(upsertCalls[0]?.[0].update.lastNotifiedScore).toBe(55);
    expect(upsertCalls[0]?.[0].update.lastRiskAlertAt).toBe(now);
  });
});
