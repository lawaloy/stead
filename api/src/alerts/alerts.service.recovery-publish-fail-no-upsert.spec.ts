import { alertOccurrenceKey } from './alert-rules';
import { AlertsService } from './alerts.service';

describe('AlertsService recovery-only publish failure before state upsert', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const lastRiskAlertAt = new Date('2026-09-06T10:00:00.000Z');
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

  it('does not advance recovery alert state when publishReadinessAlert fails', async () => {
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
        readinessPct: 40,
        status: 'stable',
        stabilityScore: 72,
        paceRequiredMonthlyKobo: 500_000,
      },
    });
    prisma.alertState.findUnique.mockResolvedValue({
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 55,
      lastRiskAlertAt,
      lastRecoveryAlertAt: null,
    });
    notifications.publishReadinessAlert.mockRejectedValue(
      new Error('recovery sms enqueue failed'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'recovery sms enqueue failed',
    );

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
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
