import { AlertsService } from './alerts.service';

describe('AlertsService updatePreferences when preference write fails', () => {
  let prisma: {
    alertPreference: { findUnique: jest.Mock; upsert: jest.Mock };
    alertState: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let notifications: { publishReadinessAlert: jest.Mock };
  let dashboard: { getStability: jest.Mock };
  let service: AlertsService;

  beforeEach(() => {
    prisma = {
      alertPreference: { findUnique: jest.fn(), upsert: jest.fn() },
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

  it('surfaces a preference persist failure instead of returning a successful update', async () => {
    prisma.alertPreference.upsert.mockRejectedValue(
      new Error('alert preference write unavailable'),
    );

    await expect(
      service.updatePreferences('user_1', { riskAlertsEnabled: true }),
    ).rejects.toThrow('alert preference write unavailable');

    expect(prisma.alertPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: { userId: 'user_1', riskAlertsEnabled: true },
      update: { riskAlertsEnabled: true },
    });
    expect(dashboard.getStability).not.toHaveBeenCalled();
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
