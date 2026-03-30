import { PrismaService } from '../prisma/prisma.service';
import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService', () => {
  let service: AuthTelemetryService;
  let prisma: {
    authEvent: {
      create: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      authEvent: {
        create: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AuthTelemetryService(prisma as never as PrismaService);
  });

  it('records auth events asynchronously', () => {
    prisma.authEvent.create.mockResolvedValue({ id: 'event_1' });

    service.recordEvent({
      type: 'otp_requested',
      phone: '+2348012345678',
      countryIso: 'NG',
      metadata: { source: 'test' },
    });

    expect(prisma.authEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: undefined,
        userAgent: undefined,
        attemptNumber: undefined,
        userId: undefined,
        otpCodeId: undefined,
        metadataJson: JSON.stringify({ source: 'test' }),
      },
    });
  });

  it('returns summary counts and masked recent events', async () => {
    prisma.authEvent.groupBy.mockResolvedValue([
      { type: 'otp_requested', _count: { _all: 2 } },
      { type: 'otp_verify_failed', _count: { _all: 1 } },
    ]);
    prisma.authEvent.findMany.mockResolvedValue([
      {
        id: 'event_1',
        type: 'otp_verify_failed',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
        attemptNumber: 2,
        userId: 'user_1',
        otpCodeId: 'otp_1',
        metadataJson: JSON.stringify({ reason: 'bad_code' }),
        createdAt: new Date('2026-03-30T00:00:00Z'),
      },
    ]);

    const result = await service.getInspection(10);

    expect(prisma.authEvent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    expect(result).toEqual({
      summary: {
        otp_requested: 2,
        otp_verify_failed: 1,
      },
      recent: [
        {
          id: 'event_1',
          type: 'otp_verify_failed',
          phone: '+234***78',
          countryIso: 'NG',
          ip: '127.0.0.1',
          userAgent: 'jest-agent',
          attemptNumber: 2,
          userId: 'user_1',
          otpCodeId: 'otp_1',
          metadata: { reason: 'bad_code' },
          createdAt: new Date('2026-03-30T00:00:00Z'),
        },
      ],
    });
  });

  it('bounds inspection limit', async () => {
    prisma.authEvent.groupBy.mockResolvedValue([]);
    prisma.authEvent.findMany.mockResolvedValue([]);

    await service.getInspection(500);

    expect(prisma.authEvent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});
