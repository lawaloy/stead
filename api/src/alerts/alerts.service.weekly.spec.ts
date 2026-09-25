import { AlertsService } from './alerts.service';

describe('AlertsService weekly summary skip paths', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  let prisma: {
    alertPreference: { findUnique: jest.Mock };
    alertState: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let notifications: { publishReadinessAlert: jest.Mock };
  let dashboard: { getStability: jest.Mock };
  let service: AlertsService;

  const stableSnapshot = {
    ok: true,
    goal: { id: 'goal_1', name: 'Rent' },
    metrics: {
      readinessPct: 40,
      status: 'stable',
      stabilityScore: 72,
      paceRequiredMonthlyKobo: 500_000,
    },
  };

  beforeEach(() => {
    prisma = {
      alertPreference: { findUnique: jest.fn() },
      alertState: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    notifications = {
      publishReadinessAlert: jest.fn().mockResolvedValue(true),
    };
    dashboard = { getStability: jest.fn().mockResolvedValue(stableSnapshot) };
    service = new AlertsService(
      prisma as never,
      notifications as never,
      dashboard as never,
    );
    prisma.alertState.upsert.mockResolvedValue({});
  });

  it('does not publish a weekly summary before the local due window', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'America/Los_Angeles',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      user: { phone: '+2348012345678' },
    });
    prisma.alertState.findUnique.mockResolvedValue(null);

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          create: { lastWeeklySummaryKey: string | null };
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastWeeklySummaryKey?: string;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].create.lastWeeklySummaryKey).toBeNull();
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
    });
  });

  it('does not republish or advance the weekly key for the same bucket', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      user: { phone: '+2348012345678' },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastWeeklySummaryKey: '2026-09-06',
      lastWeeklySummaryAt: new Date('2026-09-07T08:00:00.000Z'),
    });

    await service.evaluateUser('user_1', now);

    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          update: {
            lastObservedStatus: string;
            lastObservedScore: number;
            lastWeeklySummaryKey?: string;
            lastWeeklySummaryAt?: Date;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].update).toEqual({
      lastObservedStatus: 'stable',
      lastObservedScore: 72,
    });
  });
});
