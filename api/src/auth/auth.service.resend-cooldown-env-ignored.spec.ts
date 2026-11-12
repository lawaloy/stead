import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const OTP_CONTEXT = {
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
const ENV_KEY = 'AUTH_OTP_RESEND_COOLDOWN_MS';
const FROZEN = new Date('2026-07-24T12:00:00.000Z');

describe('AuthService process.env AUTH_OTP_RESEND_COOLDOWN_MS ignore', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };
  let previous: string | undefined;

  const compile = async (cooldownMs: number | undefined) => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'otp_recent' }),
        update: jest.fn(),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
      },
    };
    notificationPublisher = { publishOtpRequested: jest.fn() };
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
            get: jest.fn((key: string) => {
              const values: Record<string, string | number | undefined> = {
                AUTH_OTP_RESEND_COOLDOWN_MS: cooldownMs,
              };
              return values[key];
            }),
          },
        },
        {
          provide: CountriesService,
          useValue: {
            requireAuthCountry: jest.fn((iso: string) =>
              Promise.resolve({
                iso,
                label: iso,
                dialCode: '+',
                currencyCode: 'NGN',
                phoneExample: '08012345678',
                authEnabled: true,
                marketEnabled: true,
                defaultCountry: true,
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  };

  beforeEach(() => {
    previous = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('blocks resend using ConfigService cooldown even when process.env is shorter', async () => {
    await compile(120_000);
    process.env[ENV_KEY] = '1';

    await expect(
      service.requestOtp('08012345678', 'NG', OTP_CONTEXT),
    ).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        createdAt: { gt: new Date('2026-07-24T11:58:00.000Z') },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        metadata: { cooldownMs: 120_000 },
      }),
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('keeps the default 60s cooldown when ConfigService omits it even if process.env is 1', async () => {
    await compile(undefined);
    process.env[ENV_KEY] = '1';

    await expect(
      service.requestOtp('08012345678', 'NG', OTP_CONTEXT),
    ).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        createdAt: { gt: new Date('2026-07-24T11:59:00.000Z') },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        metadata: { cooldownMs: 60_000 },
      }),
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
