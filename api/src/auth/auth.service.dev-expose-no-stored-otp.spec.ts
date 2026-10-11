import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

describe('AuthService OTP replay without leaking development codes', () => {
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
  let configGet: jest.Mock;

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_new' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
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
    configGet = jest.fn();

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
          useValue: { get: configGet },
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

  it('omits otp on replay when DEV_EXPOSE_OTP is on but the stored row has none', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'DEV_EXPOSE_OTP' ? 'true' : undefined,
    );
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: null,
      user: { phone: '+2348012345678' },
    });

    const response = await request();
    expect(response).toEqual({ ok: true });
    expect(response).not.toHaveProperty('otp');
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('omits otp on replay when a stored development code exists but DEV_EXPOSE_OTP is off', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'DEV_EXPOSE_OTP' ? 'false' : undefined,
    );
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: '654321',
      user: { phone: '+2348012345678' },
    });

    const response = await request();
    expect(response).toEqual({ ok: true });
    expect(response).not.toHaveProperty('otp');
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
