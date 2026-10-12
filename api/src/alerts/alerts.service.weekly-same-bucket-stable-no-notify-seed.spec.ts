import { AlertsService } from './alerts.service';

describe('AlertsService weekly same-bucket skip does not seed a missing risk baseline', () => {
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

  it('keeps lastNotified unset when a weekly row already exists and metrics are stable', async () => {
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
        readinessPct: 62,
        status: 'stable',
        stabilityScore: 80,
        paceRequiredMonthlyKobo: 500_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastWeeklySummaryKey: '2026-09-06',
      lastWeeklySummaryAt: new Date('2026-09-07T08:00:00.000Z'),
      lastNotifiedStatus: null,
      lastNotifiedScore: null,
      lastRiskAlertAt: null,
      lastRecoveryAlertAt: null,
    });
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();

    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastRiskAlertAt?: Date;
            lastRecoveryAlertAt?: Date;
            lastWeeklySummaryKey?: string;
            lastWeeklySummaryAt?: Date;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 80,
    });
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedStatus');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedScore');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastRiskAlertAt');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryKey',
    );
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty(
      'lastWeeklySummaryAt',
    );
  });
});
