import { AlertsService } from './alerts.service';

describe('AlertsService getPreferences when preference read fails', () => {
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

  it('surfaces a preference query failure instead of returning opt-out defaults', async () => {
    prisma.alertPreference.findUnique.mockRejectedValue(
      new Error('alert preference read unavailable'),
    );

    await expect(service.getPreferences('user_1')).rejects.toThrow(
      'alert preference read unavailable',
    );

    expect(prisma.alertPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
    });
    expect(prisma.alertPreference.upsert).not.toHaveBeenCalled();
    expect(dashboard.getStability).not.toHaveBeenCalled();
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
  });
});
