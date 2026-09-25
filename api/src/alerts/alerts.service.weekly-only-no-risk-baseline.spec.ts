import { AlertsService } from './alerts.service';

describe('AlertsService weekly-only first evaluation', () => {
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

  it('publishes the weekly summary without seeding a risk baseline', async () => {
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
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(1);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'weekly.summary',
        userId: 'user_1',
        goalId: 'goal_1',
        dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      }),
    );
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
            lastNotifiedStatus: string | null;
            lastNotifiedScore: number | null;
            lastWeeklySummaryKey: string | null;
            lastWeeklySummaryAt: Date | null;
            lastObservedStatus: string;
            lastObservedScore: number;
          };
          update: {
            lastNotifiedStatus?: string;
            lastNotifiedScore?: number;
            lastWeeklySummaryKey?: string;
            lastWeeklySummaryAt?: Date;
            lastObservedStatus: string;
            lastObservedScore: number;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].create).toMatchObject({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
      lastNotifiedStatus: null,
      lastNotifiedScore: null,
      lastWeeklySummaryKey: '2026-09-06',
      lastWeeklySummaryAt: now,
    });
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
      lastWeeklySummaryAt: now,
      lastWeeklySummaryKey: '2026-09-06',
    });
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedStatus');
    expect(upsertCalls[0]?.[0].update).not.toHaveProperty('lastNotifiedScore');
  });
});
