import { BadRequestException } from '@nestjs/common';
import { AlertsService } from './alerts.service';

describe('AlertsService invalid timezone preference', () => {
  let prisma: {
    alertPreference: { upsert: jest.Mock };
  };
  let service: AlertsService;

  beforeEach(() => {
    prisma = {
      alertPreference: { upsert: jest.fn() },
    };
    service = new AlertsService(
      prisma as never,
      { publishReadinessAlert: jest.fn() } as never,
      { getStability: jest.fn() } as never,
    );
  });

  it('rejects a non-IANA timezone before writing preferences', async () => {
    await expect(
      service.updatePreferences('user_1', { timeZone: 'Fake/City' }),
    ).rejects.toThrow(
      new BadRequestException('timeZone must be a valid IANA time zone'),
    );
    expect(prisma.alertPreference.upsert).not.toHaveBeenCalled();
  });
});
