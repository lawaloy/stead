import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService empty vs whitespace OTP verification encryption key', () => {
  const envKey = 'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY';
  const envSecret = 'stead-unit-test-otp-verification-key-env-present';
  let previous: string | undefined;
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

  const serviceFor = async (secret: string) => {
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
            get: jest.fn((key: string) =>
              key === 'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY'
                ? secret
                : undefined,
            ),
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

    return module.get<AuthService>(AuthService);
  };

  beforeEach(() => {
    previous = process.env[envKey];
    process.env[envKey] = envSecret;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('treats an empty ConfigService key as missing and uses a whitespace-only key', async () => {
    const emptyService = await serviceFor('');

    await expect(
      emptyService.verifyOtp('08012345678', 'NG', '123456', {
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('OTP verification encryption key is not configured');

    expect(prisma.otpCode.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();

    const whitespaceService = await serviceFor(' \t\n ');

    await expect(
      whitespaceService.verifyOtp('08012345678', 'NG', '123456', {
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toThrow('Invalid phone or code');

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
