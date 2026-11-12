import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const ENCRYPTION_KEY = 'otp-verification-test-secret-at-least-32-characters';
const VERIFY_CONTEXT = {
  ip: '198.51.100.7',
  userAgent: 'jest-agent',
};
const ENV_KEY = 'AUTH_OTP_VERIFY_FAILURE_WINDOW_MS';
const FROZEN = new Date('2026-07-24T12:00:00.000Z');

describe('AuthService process.env AUTH_OTP_VERIFY_FAILURE_WINDOW_MS ignore', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };
  let previous: string | undefined;

  const compile = async (windowMs: number | undefined) => {
    prisma = {
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AuthTelemetryService, useValue: telemetry },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string | number | undefined> = {
                AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
                AUTH_OTP_VERIFY_FAILURE_WINDOW_MS: windowMs,
              };
              return values[key];
            }),
          },
        },
        {
          provide: CountriesService,
          useValue: {
            requireAuthCountry: jest.fn().mockResolvedValue({
              iso: 'NG',
              label: 'NG',
              dialCode: '+',
              currencyCode: 'NGN',
              phoneExample: '08012345678',
              authEnabled: true,
              marketEnabled: true,
              defaultCountry: true,
            }),
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

  it('looks back using ConfigService window even when process.env is 1ms', async () => {
    await compile(5 * 60 * 1000);
    process.env[ENV_KEY] = '1';
    telemetry.countRecentEvents.mockResolvedValue(10);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', VERIFY_CONTEXT),
    ).rejects.toMatchObject({
      message:
        'Too many invalid OTP attempts from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: new Date('2026-07-24T11:55:00.000Z'),
      ip: VERIFY_CONTEXT.ip,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        metadata: {
          reason: 'ip_window_limit_reached',
          limit: 10,
          windowMs: 5 * 60 * 1000,
        },
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the default 15-minute lookback when ConfigService omits it even if process.env is 1', async () => {
    await compile(undefined);
    process.env[ENV_KEY] = '1';
    telemetry.countRecentEvents.mockResolvedValue(1);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', VERIFY_CONTEXT),
    ).rejects.toMatchObject({
      message: 'Invalid phone or code',
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: new Date('2026-07-24T11:45:00.000Z'),
      ip: VERIFY_CONTEXT.ip,
    });
    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_locked' }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
