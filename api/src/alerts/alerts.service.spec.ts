import { BadRequestException } from '@nestjs/common';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
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

  it('returns safe opt-in defaults before a customer saves preferences', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue(null);
    await expect(service.getPreferences('user_1')).resolves.toEqual({
      weeklySummaryEnabled: false,
      riskAlertsEnabled: false,
      channel: 'sms',
      timeZone: 'UTC',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      updatedAt: null,
    });
  });

  it('validates time zones and upserts preferences', async () => {
    await expect(
      service.updatePreferences('user_1', { timeZone: 'Not/AZone' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updatePreferences('user_1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.alertPreference.upsert.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      updatedAt,
    });
    await expect(
      service.updatePreferences('user_1', {
        weeklySummaryEnabled: true,
        timeZone: 'Africa/Lagos',
      }),
    ).resolves.toMatchObject({
      weeklySummaryEnabled: true,
      channel: 'sms',
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('queues a due weekly summary and first material risk once', async () => {
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
    prisma.alertState.upsert.mockResolvedValue({});

    await service.evaluateUser('user_1', updatedAt);

    expect(notifications.publishReadinessAlert).toHaveBeenCalledTimes(2);
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'weekly.summary',
        dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
      }),
    );
    expect(notifications.publishReadinessAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'risk.alert' }),
    );
    const upsertCalls = prisma.alertState.upsert.mock.calls as Array<
      [
        {
          create: {
            lastWeeklySummaryKey: string | null;
            lastRiskAlertAt: Date | null;
          };
        },
      ]
    >;
    expect(upsertCalls[0]?.[0].create.lastWeeklySummaryKey).toBe('2026-09-06');
    expect(upsertCalls[0]?.[0].create.lastRiskAlertAt).toBe(updatedAt);
  });

  it('does nothing when alerts are disabled or there is no active goal', async () => {
    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: false,
      riskAlertsEnabled: false,
    });
    await service.evaluateUser('user_1', updatedAt);
    expect(dashboard.getStability).not.toHaveBeenCalled();

    prisma.alertPreference.findUnique.mockResolvedValue({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      user: { phone: '+2348012345678' },
    });
    dashboard.getStability.mockResolvedValue({
      ok: false,
      message: 'No active goal found',
    });
    await service.evaluateUser('user_1', updatedAt);
    expect(notifications.publishReadinessAlert).not.toHaveBeenCalled();
  });
});
