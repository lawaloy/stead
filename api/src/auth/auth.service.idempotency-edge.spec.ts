import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const REQUEST_KEY_HASH = createHash('sha256')
  .update(IDEMPOTENCY_KEY)
  .digest('hex');

describe('AuthService OTP idempotency key edges', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: {
    publishOtpRequested: jest.Mock;
    isOtpRequestEnqueued: jest.Mock;
    adoptLegacyOtpRequest: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
      },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
      isOtpRequestEnqueued: jest.fn().mockResolvedValue(false),
      adoptLegacyOtpRequest: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        {
          provide: AuthTelemetryService,
          useValue: {
            recordEvent: jest.fn(),
            countRecentEvents: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'DEV_EXPOSE_OTP' ? 'true' : undefined,
            ),
          },
        },
        {
          provide: CountriesService,
          useValue: {
            requireAuthCountry: jest.fn().mockResolvedValue({ iso: 'NG' }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('replays after trimming and lowercasing a padded UUIDv4 key', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: `  ${IDEMPOTENCY_KEY.toUpperCase()}  `,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(prisma.otpCode.findUnique).toHaveBeenCalledWith({
      where: { requestKeyHash: REQUEST_KEY_HASH },
      include: { user: { select: { phone: true } } },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('rejects UUID v1 keys before writing auth state', async () => {
    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: '550e8400-e29b-11d4-a716-446655440000',
      }),
    ).rejects.toThrow('Idempotency-Key must be a UUIDv4 value.');
    expect(prisma.otpCode.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('propagates a create collision when the winning row is still unreadable', async () => {
    const collision = { code: 'P2002' };
    prisma.otpCode.create.mockRejectedValue(collision);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBe(collision);
    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(2);
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
