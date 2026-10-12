import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const OTP_CONTEXT = {
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  ip: '203.0.113.10',
  deviceId: '11111111-1111-4111-8111-111111111111',
  userAgent: 'jest-agent',
};

describe('AuthService OTP replay enqueue lookup failure', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: {
    publishOtpRequested: jest.Mock;
    isOtpRequestEnqueued: jest.Mock;
    adoptLegacyOtpRequest: jest.Mock;
  };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { upsert: jest.fn() },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
      isOtpRequestEnqueued: jest.fn(),
      adoptLegacyOtpRequest: jest.fn(),
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn(),
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
              const values: Record<string, string> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_DEVICE_IDENTIFIER_SECRET:
                  'test-device-identifier-secret-1234567890',
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

  it('surfaces an enqueue probe failure instead of repairing, restarting, or returning 503', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_incomplete',
      userId: 'user_1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 9 * 60_000),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.isOtpRequestEnqueued.mockRejectedValue(
      new Error('otp enqueue lookup unavailable'),
    );

    const error = await service
      .requestOtp('08012345678', 'NG', OTP_CONTEXT)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'otp enqueue lookup unavailable');
    expect(error).not.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });

    expect(notificationPublisher.isOtpRequestEnqueued).toHaveBeenCalledWith(
      expect.stringMatching(/^otp\.requested:/),
      'otp_incomplete',
    );
    expect(notificationPublisher.adoptLegacyOtpRequest).not.toHaveBeenCalled();
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(prisma.otpCode.count).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });
});
