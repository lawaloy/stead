import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService corrupt metadataJson parsing', () => {
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
        findMany: jest.fn(),
      },
    };
    service = new AuthTelemetryService(prisma as never);
  });

  it('fails closed to null metadata when metadataJson is not valid JSON', async () => {
    prisma.authEvent.findMany.mockResolvedValue([
      {
        id: 'event_corrupt',
        type: 'otp_verify_failed',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        deviceHash: null,
        userAgent: null,
        attemptNumber: 1,
        userId: null,
        otpCodeId: null,
        metadataJson: '{not-json',
        createdAt: new Date('2026-08-05T00:00:00Z'),
      },
    ]);

    const result = await service.getInspection(5);

    expect(result.recent).toEqual([
      {
        id: 'event_corrupt',
        type: 'otp_verify_failed',
        phone: '+234***78',
        countryIso: 'NG',
        ip: '127.0.0.1',
        deviceRef: null,
        userAgent: null,
        attemptNumber: 1,
        userId: null,
        otpCodeId: null,
        metadata: null,
        createdAt: new Date('2026-08-05T00:00:00Z'),
      },
    ]);
  });

  it('still maps valid metadataJson while failing closed on corrupt rows', async () => {
    prisma.authEvent.findMany.mockResolvedValue([
      {
        id: 'event_ok',
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: null,
        deviceHash: null,
        userAgent: null,
        attemptNumber: null,
        userId: null,
        otpCodeId: null,
        metadataJson: JSON.stringify({ source: 'ok' }),
        createdAt: new Date('2026-08-05T00:00:00Z'),
      },
      {
        id: 'event_bad',
        type: 'otp_verify_failed',
        phone: '+2348098765432',
        countryIso: 'NG',
        ip: null,
        deviceHash: null,
        userAgent: null,
        attemptNumber: null,
        userId: null,
        otpCodeId: null,
        metadataJson: 'null-but-not-json]',
        createdAt: new Date('2026-08-05T00:00:01Z'),
      },
    ]);

    const result = await service.getInspection(10);

    expect(result.recent.map((row) => [row.id, row.metadata])).toEqual([
      ['event_ok', { source: 'ok' }],
      ['event_bad', null],
    ]);
  });
});
