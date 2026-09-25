import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService evaluateUser with a replaced isActive ghost goal', () => {
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

  it('targets the dashboard ghost goal even when leftover state exists for another goal', async () => {
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
      goal: { id: 'goal_replaced', name: 'Rent buffer' },
      metrics: {
        readinessPct: 5,
        status: 'critical',
        stabilityScore: 18,
        paceRequiredMonthlyKobo: 1_400_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue(null);
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(prisma.alertState.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.alertState.findUnique).toHaveBeenCalledWith({
      where: {
        userId_goalId: { userId: 'user_1', goalId: 'goal_replaced' },
      },
    });
    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'risk.alert',
      userId: 'user_1',
      goalId: 'goal_replaced',
      dedupeKey: alertOccurrenceKey({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_replaced',
        previousStatus: null,
        previousScore: null,
        currentStatus: 'critical',
        currentScore: 18,
        lastRiskAlertAt: null,
        lastRecoveryAlertAt: null,
      }),
      payload: {
        phone: '+2348012345678',
        body: 'Stead alert: Rent buffer moved to critical (score 18). Review recent spending and your required savings pace.',
      },
    });
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          where: { userId_goalId: { userId: string; goalId: string } };
          create: {
            goalId: string;
            lastNotifiedStatus: string | null;
            lastNotifiedScore: number | null;
            lastRiskAlertAt: Date | null;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].where).toEqual({
      userId_goalId: { userId: 'user_1', goalId: 'goal_replaced' },
    });
    expect(upsertCalls[0]?.[0].create).toMatchObject({
      goalId: 'goal_replaced',
      lastNotifiedStatus: 'critical',
      lastNotifiedScore: 18,
      lastRiskAlertAt: now,
    });
  });
});
