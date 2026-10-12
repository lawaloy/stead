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
const FROZEN_NOW = new Date('2026-10-11T18:00:00.000Z');

describe('AuthService OTP publish failure leaves same-key processing', () => {
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
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);

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
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AuthTelemetryService, useValue: telemetry },
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

  it('returns 503 on the same key immediately after enqueue fails', async () => {
    notificationPublisher.publishOtpRequested.mockRejectedValue(
      new Error('queue unavailable'),
    );

    const context = {
      idempotencyKey: IDEMPOTENCY_KEY,
      ip: '203.0.113.10',
    };

    await expect(
      service.requestOtp('08012345678', 'NG', context),
    ).rejects.toThrow('queue unavailable');

    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_1',
      createdAt: FROZEN_NOW,
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.requestOtp('08012345678', 'NG', context),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'The matching OTP request is still processing. Retry shortly.',
    });

    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
    expect(telemetry.countRecentEvents).toHaveBeenCalledTimes(1);
  });
});
