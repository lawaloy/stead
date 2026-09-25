import { AlertsService } from './alerts.service';

describe('AlertsService publish failure before state upsert', () => {
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

  it('does not advance weekly alert state when publishReadinessAlert fails', async () => {
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
    notifications.publishReadinessAlert.mockRejectedValue(
      new Error('sms enqueue failed'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'sms enqueue failed',
    );

    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith({
      type: 'weekly.summary',
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      payload: {
        phone: '+2348012345678',
        body: 'Stead weekly: Rent is 40% ready, status stable, score 72. Required monthly pace: ₦10,000.',
      },
    });
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
