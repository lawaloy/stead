import { AlertsService } from './alerts.service';

describe('AlertsService missing preference row', () => {
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

  it('does not evaluate stability when the customer never saved preferences', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue(null);

    await service.evaluateUser('user_1', now);

    expect(dashboard.getStability).not.toHaveBeenCalled();
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
    expect(prisma.alertState.findUnique).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });
});
