import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const FROZEN_NOW = new Date('2026-10-11T16:00:00.000Z');
const PROCESSING_TIMEOUT_MS = 30_000;

describe('AuthService OTP processing-timeout boundary', () => {
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
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);

    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  afterEach(() => {
    jest.useRealTimers();
  });

  const incompleteRow = (createdAt: Date) => ({
    id: 'otp_processing',
    userId: 'user_1',
    createdAt,
    expiresAt: new Date(FROZEN_NOW.getTime() + 9 * 60_000),
    requestCompletedAt: null,
    developmentOtp: '123456',
    user: { phone: '+2348012345678' },
  });

  it('treats an incomplete request created exactly 30s ago as stale and restarts it', async () => {
    const createdAt = new Date(FROZEN_NOW.getTime() - PROCESSING_TIMEOUT_MS);
    prisma.otpCode.findUnique.mockResolvedValueOnce(incompleteRow(createdAt));

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'otp_processing',
        requestCompletedAt: null,
        createdAt: { lte: createdAt },
      },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when the incomplete request is 1ms younger than the 30s deadline', async () => {
    prisma.otpCode.findUnique.mockResolvedValue(
      incompleteRow(new Date(FROZEN_NOW.getTime() - PROCESSING_TIMEOUT_MS + 1)),
    );

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
