import { AlertsService } from './alerts.service';

describe('AlertsService partial preference updates', () => {
  const updatedAt = new Date('2026-09-07T10:00:00.000Z');
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

  it('patches only the submitted preference fields so schedule values stay intact', async () => {
    prisma.alertPreference.upsert.mockResolvedValue({
      weeklySummaryEnabled: false,
      riskAlertsEnabled: true,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      updatedAt,
    });

    await expect(
      service.updatePreferences('user_1', { riskAlertsEnabled: true }),
    ).resolves.toEqual({
      weeklySummaryEnabled: false,
      riskAlertsEnabled: true,
      channel: 'sms',
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      updatedAt: updatedAt.toISOString(),
    });
    expect(prisma.alertPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: { userId: 'user_1', riskAlertsEnabled: true },
      update: { riskAlertsEnabled: true },
    });
  });
});
