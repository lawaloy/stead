import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000001';
const WHITESPACE_USER_AGENT = ' \t\n ';

describe('AuthService empty vs whitespace request user agent', () => {
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

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'otp_1' }),
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
            get: jest.fn(),
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
  });

  it('stores empty-string user agents as unbound and persists whitespace-only user agents', async () => {
    await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
      userAgent: '',
    });

    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalled();
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAgent: undefined,
      }) as unknown,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        userAgent: '',
      }),
    );

    prisma.otpCode.create.mockClear();
    telemetry.recordEvent.mockClear();
    notificationPublisher.publishOtpRequested.mockClear();

    await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
      userAgent: WHITESPACE_USER_AGENT,
    });

    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalled();
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAgent: WHITESPACE_USER_AGENT,
      }) as unknown,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        userAgent: WHITESPACE_USER_AGENT,
      }),
    );
  });
});
