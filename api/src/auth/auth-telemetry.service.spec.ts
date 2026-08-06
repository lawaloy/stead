import { PrismaService } from '../prisma/prisma.service';
import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService', () => {
  let service: AuthTelemetryService;
  let prisma: {
    authEvent: {
      create: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      authEvent: {
        create: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AuthTelemetryService(prisma as never as PrismaService);
    prisma.authEvent.count.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits for auth events to be persisted', async () => {
    prisma.authEvent.create.mockResolvedValue({ id: 'event_1' });

    await service.recordEvent({
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
        deviceHash: undefined,
        userAgent: undefined,
        attemptNumber: undefined,
        userId: undefined,
        otpCodeId: undefined,
        metadataJson: JSON.stringify({ source: 'test' }),
      },
    });
  });

  it('counts recent OTP requests for the caller IP and time window', async () => {
    const since = new Date('2026-07-01T12:00:00.000Z');
    prisma.authEvent.count.mockResolvedValue(19);

    await expect(
      service.countRecentEvents({
        types: ['otp_requested'],
        since,
        ip: '203.0.113.10',
      }),
    ).resolves.toBe(19);

    expect(prisma.authEvent.count).toHaveBeenCalledWith({
      where: {
        type: { in: ['otp_requested'] },
        createdAt: { gte: since },
        ip: '203.0.113.10',
        phone: undefined,
        deviceHash: undefined,
      },
    });
  });

  it('counts all verify failure events for IP lockout checks', async () => {
    const since = new Date('2026-07-01T12:00:00.000Z');
    prisma.authEvent.count.mockResolvedValue(9);

    await expect(
      service.countRecentEvents({
        types: ['otp_verify_failed', 'otp_verify_locked'],
        since,
        ip: '198.51.100.4',
      }),
    ).resolves.toBe(9);

    expect(prisma.authEvent.count).toHaveBeenCalledWith({
      where: {
        type: { in: ['otp_verify_failed', 'otp_verify_locked'] },
        createdAt: { gte: since },
        ip: '198.51.100.4',
        phone: undefined,
        deviceHash: undefined,
      },
    });
  });

  it('returns summary counts and masked recent events', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    prisma.authEvent.groupBy
      .mockResolvedValueOnce([
        { type: 'otp_requested', _count: { _all: 2 } },
        { type: 'otp_verify_failed', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { type: 'otp_verify_failed', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { type: 'otp_verify_failed', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { type: 'otp_verify_failed', _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([{ phone: '+2348012345678', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ ip: '127.0.0.1', _count: { _all: 2 } }])
      .mockResolvedValueOnce([
        { deviceHash: 'abcdef0123456789', _count: { _all: 2 } },
      ]);
    prisma.authEvent.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    prisma.authEvent.findMany.mockResolvedValue([
      {
        id: 'event_1',
        type: 'otp_verify_failed',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        deviceHash: 'abcdef0123456789',
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
      diagnostics: {
        generatedAt: new Date('2026-08-05T12:00:00.000Z'),
        windows: {
          last15Minutes: { otp_verify_failed: 1 },
          lastHour: { otp_verify_failed: 2 },
          last24Hours: { otp_verify_failed: 3 },
        },
        deviceCoverageLast24Hours: {
          otpRequests: 4,
          withDevice: 3,
          percentage: 75,
        },
        repeatedAbuseLast24Hours: {
          phones: [{ phone: '+234***78', count: 3 }],
          ips: [{ ip: '127.0.0.1', count: 2 }],
          devices: [{ deviceRef: 'device_abcdef0123456789', count: 2 }],
        },
      },
      recent: [
        {
          id: 'event_1',
          type: 'otp_verify_failed',
          phone: '+234***78',
          countryIso: 'NG',
          ip: '127.0.0.1',
          deviceRef: 'device_abcdef0123456789',
          userAgent: 'jest-agent',
          attemptNumber: 2,
          userId: 'user_1',
          otpCodeId: 'otp_1',
          metadata: { reason: 'bad_code' },
          createdAt: new Date('2026-03-30T00:00:00Z'),
        },
      ],
    });
    jest.useRealTimers();
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

  it('clamps inspection limit to a minimum of 1', async () => {
    prisma.authEvent.groupBy.mockResolvedValue([]);
    prisma.authEvent.findMany.mockResolvedValue([]);

    await service.getInspection(0);

    expect(prisma.authEvent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  });

  it('leaves short phones unmasked and null metadata untouched', async () => {
    prisma.authEvent.groupBy.mockResolvedValue([]);
    prisma.authEvent.findMany.mockResolvedValue([
      {
        id: 'event_short',
        type: 'otp_requested',
        phone: '1234',
        countryIso: 'NG',
        ip: null,
        deviceHash: null,
        userAgent: null,
        attemptNumber: null,
        userId: null,
        otpCodeId: null,
        metadataJson: null,
        createdAt: new Date('2026-03-30T00:00:00Z'),
      },
    ]);

    const result = await service.getInspection(5);

    expect(result.recent).toEqual([
      {
        id: 'event_short',
        type: 'otp_requested',
        phone: '1234',
        countryIso: 'NG',
        ip: null,
        deviceRef: null,
        userAgent: null,
        attemptNumber: null,
        userId: null,
        otpCodeId: null,
        metadata: null,
        createdAt: new Date('2026-03-30T00:00:00Z'),
      },
    ]);
  });
});
