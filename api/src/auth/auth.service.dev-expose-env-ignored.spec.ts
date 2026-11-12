import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

describe('AuthService process.env DEV_EXPOSE_OTP ignore', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  let configGet: jest.Mock;
  const envKey = 'DEV_EXPOSE_OTP';
  let previous: string | undefined;

  const compile = async (configEnv: Record<string, string>) => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
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
    configGet = jest.fn((key: string) => configEnv[key]);

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
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: CountriesService,
          useValue: {
            requireAuthCountry: jest.fn().mockResolvedValue({ iso: 'NG' }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  };

  beforeEach(() => {
    previous = process.env[envKey];
    delete process.env[envKey];
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('omits otp when ConfigService is off even if process.env exposes it', async () => {
    await compile({ DEV_EXPOSE_OTP: 'false' });
    process.env[envKey] = 'true';

    const response = await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(response).toEqual({ ok: true });
    expect(response).not.toHaveProperty('otp');
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        developmentOtp: undefined,
      }) as unknown,
    });
  });

  it('returns otp when ConfigService is on even if process.env disables it', async () => {
    await compile({ DEV_EXPOSE_OTP: 'true' });
    process.env[envKey] = 'false';

    const response = await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(response).toEqual({
      ok: true,
      otp: expect.stringMatching(/^\d{6}$/) as unknown,
    });
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        developmentOtp: response.otp,
      }) as unknown,
    });
  });
});
