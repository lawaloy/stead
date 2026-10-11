import { AlertsService } from './alerts.service';

describe('AlertsService evaluateUser when alert state read fails', () => {
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

  it('does not publish or upsert when the existing alert state cannot be read', async () => {
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
    prisma.alertState.findUnique.mockRejectedValue(
      new Error('alert state read unavailable'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'alert state read unavailable',
    );

    expect(dashboard.getStability).toHaveBeenCalledWith('user_1', now);
    expect(prisma.alertState.findUnique).toHaveBeenCalledWith({
      where: { userId_goalId: { userId: 'user_1', goalId: 'goal_1' } },
    });
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
