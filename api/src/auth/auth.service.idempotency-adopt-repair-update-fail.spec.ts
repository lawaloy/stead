import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

describe('AuthService OTP adopt-repair completion write failure', () => {
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
        create: jest.fn().mockResolvedValue({ id: 'otp_legacy' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'otp_legacy' }),
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

  it('surfaces an adopt-repair update failure without creating or publishing another OTP', async () => {
    const createdAt = new Date(Date.now() - 60_000);
    const expiresAt = new Date(Date.now() + 9 * 60_000);
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_legacy',
      userId: 'user_1',
      createdAt,
      expiresAt,
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.adoptLegacyOtpRequest.mockResolvedValue(true);
    prisma.otpCode.update.mockRejectedValue(
      new Error('completion write unavailable'),
    );

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toThrow('completion write unavailable');

    expect(notificationPublisher.adoptLegacyOtpRequest).toHaveBeenCalledWith({
      userId: 'user_1',
      otpCodeId: 'otp_legacy',
      dedupeKey: expect.stringMatching(/^otp\.requested:/) as unknown,
      requestedAt: createdAt,
      expiresAt,
    });
    expect(prisma.otpCode.update).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_legacy' },
      data: { requestCompletedAt: expect.any(Date) as Date },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
