import { AlertsService } from './alerts.service';

describe('AlertsService evaluateUser without an active goal', () => {
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

  it('does not upsert alert state when dashboard has no active goal', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: true,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      user: { phone: '+2348012345678' },
    });
    dashboard.getStability.mockResolvedValue({
      ok: false,
      message: 'No active goal found',
    });

    await service.evaluateUser('user_1', now);

    expect(dashboard.getStability).toHaveBeenCalledWith('user_1', now);
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.findUnique).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
