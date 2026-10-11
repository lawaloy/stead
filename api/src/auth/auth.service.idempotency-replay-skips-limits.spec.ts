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

describe('AuthService completed OTP replay skips rate limits', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
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
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
      },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
      isOtpRequestEnqueued: jest.fn(),
      adoptLegacyOtpRequest: jest.fn(),
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn(),
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

  it('replays a completed key without counting IP, device, or phone limits', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
        ip: '198.51.100.10',
        userAgent: 'jest-agent',
        deviceId: '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });

    expect(prisma.otpCode.findUnique).toHaveBeenCalledWith({
      where: { requestKeyHash: REQUEST_KEY_HASH },
      include: { user: { select: { phone: true } } },
    });
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.otpCode.count).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
    expect(notificationPublisher.isOtpRequestEnqueued).not.toHaveBeenCalled();
    expect(notificationPublisher.adoptLegacyOtpRequest).not.toHaveBeenCalled();
  });
});
