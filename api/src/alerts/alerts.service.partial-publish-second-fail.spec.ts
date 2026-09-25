import { AlertsService } from './alerts.service';

describe('AlertsService partial publish then failure', () => {
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

  it('does not upsert alert state when weekly enqueue succeeds and risk enqueue fails', async () => {
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
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('risk enqueue failed'));

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'risk enqueue failed',
    );

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(2);
    expect(notifications.publishReadinessAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'weekly.summary',
        userId: 'user_1',
        goalId: 'goal_1',
        dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      }),
    );
    expect(notifications.publishReadinessAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_1',
      }),
    );
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
