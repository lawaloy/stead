import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const ENCRYPTION_KEY = 'otp-verification-test-secret-at-least-32-characters';
const DEVICE_ID = '908de9d7-7c80-4275-a255-a5f6e1f7246f';
const DEVICE_SECRET = 'test-device-identifier-secret-1234567890';
const DEVICE_HASH = createHmac('sha256', DEVICE_SECRET)
  .update(DEVICE_ID)
  .digest('hex');
const ENV_KEY = 'AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW';

describe('AuthService process.env AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW ignore', () => {
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

  const compile = async (limit: number | undefined) => {
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
                AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
                AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW: limit,
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
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('locks by device using ConfigService even when process.env allows more failures', async () => {
    await compile(3);
    process.env[ENV_KEY] = '99';
    telemetry.countRecentEvents.mockResolvedValue(3);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', { deviceId: DEVICE_ID }),
    ).rejects.toMatchObject({
      message:
        'Too many invalid OTP attempts from this device. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: expect.any(Date) as unknown,
      deviceHash: DEVICE_HASH,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        deviceHash: DEVICE_HASH,
        metadata: {
          reason: 'device_window_limit_reached',
          limit: 3,
          windowMs: 15 * 60 * 1000,
        },
      }),
    );
    expect(JSON.stringify(telemetry.recordEvent.mock.calls)).not.toContain(
      DEVICE_ID,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the default eight-failure device window when ConfigService omits it even if process.env is 1', async () => {
    await compile(undefined);
    process.env[ENV_KEY] = '1';
    telemetry.countRecentEvents.mockResolvedValue(1);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', { deviceId: DEVICE_ID }),
    ).rejects.toMatchObject({
      message: 'Invalid phone or code',
    });

    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_locked' }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
