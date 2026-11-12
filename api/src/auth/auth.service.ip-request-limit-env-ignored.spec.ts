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
  ip: '203.0.113.10',
  userAgent: 'jest-agent',
};
const ENV_KEY = 'AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR';

describe('AuthService process.env AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR ignore', () => {
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

  const compile = async (limit: number | undefined) => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
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
                AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR: limit,
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
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('rate-limits by IP using ConfigService even when process.env allows more requests', async () => {
    await compile(2);
    process.env[ENV_KEY] = '99';
    telemetry.countRecentEvents.mockResolvedValue(2);

    await expect(
      service.requestOtp('08012345678', 'NG', OTP_CONTEXT),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        phone: '+2348012345678',
        ip: OTP_CONTEXT.ip,
        metadata: { limit: 2, window: '1h', scope: 'ip' },
      }),
    );
    expect(prisma.otpCode.count).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('keeps the default 20-request IP limit when ConfigService omits it even if process.env is 1', async () => {
    await compile(undefined);
    process.env[ENV_KEY] = '1';
    telemetry.countRecentEvents.mockResolvedValue(1);

    await expect(
      service.requestOtp('08012345678', 'NG', OTP_CONTEXT),
    ).resolves.toEqual({ ok: true });

    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_request_rate_limited' }),
    );
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalled();
  });
});
