import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService orphan OTP resend block', () => {
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

  it('blocks a follow-up request after SMS enqueue fails on a stored OTP', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'otp_1' });
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });
    notificationPublisher.publishOtpRequested.mockRejectedValue(
      new Error('queue unavailable'),
    );

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toThrow('queue unavailable');

    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    } satisfies Partial<HttpException>);

    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        phone: '+2348012345678',
        countryIso: 'NG',
        userId: 'user_1',
        otpCodeId: 'otp_1',
      }),
    );
  });
});
