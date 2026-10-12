import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

describe('AuthService stale OTP cleanup enqueue-probe failure', () => {
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
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'otp_stale' }),
        deleteMany: jest.fn(),
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
      isOtpRequestEnqueued: jest.fn(),
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

    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_stale',
      createdAt: new Date(Date.now() - 60_000),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
  });

  it('does not complete or restart a stale OTP when the cleanup enqueue probe fails', async () => {
    const probeFail = new Error('enqueue probe unavailable');
    notificationPublisher.isOtpRequestEnqueued
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(probeFail);
    prisma.otpCode.deleteMany.mockRejectedValue({ code: 'P2003' });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBe(probeFail);
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
    expect(notificationPublisher.isOtpRequestEnqueued).toHaveBeenCalledTimes(2);
  });
});
