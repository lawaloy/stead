import { randomInt } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomInt: jest.fn(actual.randomInt),
  };
});

describe('AuthService OTP crypto padding', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
    };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
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
            get: jest.fn((key: string) =>
              key === 'DEV_EXPOSE_OTP' ? 'true' : undefined,
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
                marketEnabled: iso === 'NG',
                defaultCountry: iso === 'NG',
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.mocked(randomInt).mockReset();
  });

  afterEach(() => {
    jest.mocked(randomInt).mockRestore();
  });

  it.each([
    [0, '000000'],
    [42, '000042'],
    [999999, '999999'],
  ])(
    'zero-pads randomInt(%p) to a six-digit OTP (%p)',
    async (value, expectedOtp) => {
      jest.mocked(randomInt).mockReturnValue(value);

      const response = await service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      });

      expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
      expect(response).toEqual({ ok: true, otp: expectedOtp });
      expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
        phone: '+2348012345678',
        otp: expectedOtp,
      });
    },
  );
});
