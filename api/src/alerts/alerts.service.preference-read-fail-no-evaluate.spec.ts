import { AlertsService } from './alerts.service';

describe('AlertsService evaluateUser when preference read fails', () => {
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

  it('does not evaluate stability when preference lookup throws', async () => {
    prisma.alertPreference.findUnique.mockRejectedValue(
      new Error('alert preference read unavailable'),
    );

    await expect(service.evaluateUser('user_1', now)).rejects.toThrow(
      'alert preference read unavailable',
    );

    expect(prisma.alertPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      include: { user: { select: { phone: true } } },
    });
    expect(dashboard.getStability).not.toHaveBeenCalled();
    expect(prisma.alertState.findUnique).not.toHaveBeenCalled();
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
