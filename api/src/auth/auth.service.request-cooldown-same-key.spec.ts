import { createHash } from 'node:crypto';
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
const REQUEST_KEY_HASH = createHash('sha256')
  .update(IDEMPOTENCY_KEY)
  .digest('hex');

describe('AuthService OTP cooldown same-key race', () => {
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
  let notificationPublisher: { publishOtpRequested: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_new' }),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
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

  const request = () =>
    service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

  it('replays a completed same-key row found after the unique lookup misses', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      requestKeyHash: REQUEST_KEY_HASH,
      requestCompletedAt: new Date(),
      developmentOtp: '654321',
    });

    await expect(request()).resolves.toEqual({ ok: true, otp: '654321' });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('returns 503 when the same key is still processing after the unique lookup misses', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      requestKeyHash: REQUEST_KEY_HASH,
      requestCompletedAt: null,
      developmentOtp: '654321',
    });

    await expect(request()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'The matching OTP request is still processing. Retry shortly.',
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
