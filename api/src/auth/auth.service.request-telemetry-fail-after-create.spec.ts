import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService telemetry failure after OTP create', () => {
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
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
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
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: notificationPublisher,
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AuthTelemetryService, useValue: telemetry },
        { provide: ConfigService, useValue: { get: jest.fn() } },
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

  it('persists the OTP but does not enqueue SMS when request telemetry fails', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });
    telemetry.recordEvent.mockRejectedValue(new Error('telemetry unavailable'));

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toThrow('telemetry unavailable');

    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        codeHash: expect.any(String) as unknown,
        expiresAt: expect.any(Date) as unknown,
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
        userId: 'user_1',
      }),
    );
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
