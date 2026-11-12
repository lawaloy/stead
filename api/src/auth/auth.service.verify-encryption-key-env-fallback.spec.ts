import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService OTP verification encryption key env fallback', () => {
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

  beforeEach(async () => {
    prisma = {
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
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
            get: jest.fn(() => undefined),
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

    service = module.get<AuthService>(AuthService);
  });

  it('uses process.env when ConfigService omits the OTP verification encryption key', async () => {
    const previous = process.env.AUTH_OTP_VERIFICATION_ENCRYPTION_KEY;
    process.env.AUTH_OTP_VERIFICATION_ENCRYPTION_KEY =
      'stead-unit-test-otp-verification-key-env-fallback';

    try {
      await expect(
        service.verifyOtp('08012345678', 'NG', '123456', {
          idempotencyKey: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toThrow('Invalid phone or code');
    } finally {
      if (previous === undefined) {
        delete process.env.AUTH_OTP_VERIFICATION_ENCRYPTION_KEY;
      } else {
        process.env.AUTH_OTP_VERIFICATION_ENCRYPTION_KEY = previous;
      }
    }

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
