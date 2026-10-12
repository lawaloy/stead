import { BadRequestException } from '@nestjs/common';
import { AlertsService } from './alerts.service';

describe('AlertsService empty preference updates', () => {
  it('rejects an empty patch before writing preferences', async () => {
    const prisma = {
      alertPreference: { upsert: jest.fn() },
    };
    const service = new AlertsService(
      prisma as never,
      { publishReadinessAlert: jest.fn() } as never,
      { getStability: jest.fn() } as never,
    );

    const error = await service
      .updatePreferences('user_1', {})
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'At least one preference is required',
    );
    expect(prisma.alertPreference.upsert).not.toHaveBeenCalled();
  });
});
