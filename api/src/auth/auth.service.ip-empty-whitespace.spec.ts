import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000001';
const WHITESPACE_IP = ' \t\n ';

describe('AuthService empty vs whitespace request IP', () => {
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
            get: jest.fn((key: string) => {
              const values: Record<string, string | number | undefined> = {
                AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR: 20,
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
  });

  it('skips IP rate limits for empty-string IPs and counts whitespace-only IPs', async () => {
    await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
      ip: '',
    });

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalled();
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ip: undefined,
      }) as unknown,
    });

    telemetry.countRecentEvents.mockResolvedValue(20);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
        ip: WHITESPACE_IP,
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ['otp_requested'],
        ip: WHITESPACE_IP,
      }),
    );
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        ip: WHITESPACE_IP,
        metadata: { limit: 20, window: '1h', scope: 'ip' },
      }),
    );
  });
});
