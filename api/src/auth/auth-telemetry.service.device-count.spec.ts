import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService device counting', () => {
  let service: AuthTelemetryService;
  let prisma: {
    authEvent: {
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      authEvent: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AuthTelemetryService(prisma as never);
  });

  it('counts recent events for a keyed device identity', async () => {
    const since = new Date('2026-08-05T12:00:00.000Z');
    const deviceHash =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    prisma.authEvent.count.mockResolvedValue(8);

    await expect(
      service.countRecentEvents({
        types: ['otp_verify_failed', 'otp_verify_locked'],
        since,
        deviceHash,
      }),
    ).resolves.toBe(8);

    expect(prisma.authEvent.count).toHaveBeenCalledWith({
      where: {
        type: { in: ['otp_verify_failed', 'otp_verify_locked'] },
        createdAt: { gte: since },
        ip: undefined,
        phone: undefined,
        deviceHash,
      },
    });
  });

  it('reports zero device coverage when no OTP requests were recorded', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));

    const result = await service.getInspection(5);

    expect(prisma.authEvent.count).toHaveBeenCalledWith({
      where: {
        type: 'otp_requested',
        createdAt: { gte: new Date('2026-08-04T12:00:00.000Z') },
      },
    });
    expect(prisma.authEvent.count).toHaveBeenCalledWith({
      where: {
        type: 'otp_requested',
        createdAt: { gte: new Date('2026-08-04T12:00:00.000Z') },
        deviceHash: { not: null },
      },
    });
    expect(result.diagnostics.deviceCoverageLast24Hours).toEqual({
      otpRequests: 0,
      withDevice: 0,
      percentage: 0,
    });
    jest.useRealTimers();
  });
});
