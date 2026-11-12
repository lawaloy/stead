import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService process.env AUTH_DEVICE_IDENTIFIER_SECRET ignore', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  const envKey = 'AUTH_DEVICE_IDENTIFIER_SECRET';
  const envSecret = 'process-env-device-identifier-secret-32';
  const deviceId = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
  let previous: string | undefined;

  beforeEach(async () => {
    previous = process.env[envKey];
    process.env[envKey] = envSecret;
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
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
            get: jest.fn((key: string) => {
              if (key === envKey) {
                return undefined;
              }
              return undefined;
            }),
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

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('rejects device-bound OTP request and verify when ConfigService omits the secret even if process.env is set', async () => {
    await expect(
      service.requestOtp('08012345678', 'NG', {
        deviceId,
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('Auth device identifier secret is not configured');
    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', { deviceId }),
    ).rejects.toThrow('Auth device identifier secret is not configured');

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
