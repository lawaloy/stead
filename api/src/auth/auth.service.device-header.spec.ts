import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService device header edges', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
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
        findUnique: jest.fn(),
      },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'AUTH_DEVICE_IDENTIFIER_SECRET') {
          return 'test-device-identifier-secret-1234567890';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AuthTelemetryService, useValue: telemetry },
        { provide: ConfigService, useValue: config },
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

  it.each(['device-one', '0f81c2a7-1e6d-3f05-9a1c-03de8a5f6b77', '   '])(
    'rejects a malformed device id (%p) before writing an OTP',
    async (deviceId) => {
      await expect(
        service.requestOtp('08012345678', 'NG', { deviceId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.requestOtp('08012345678', 'NG', { deviceId }),
      ).rejects.toMatchObject({
        message: 'X-Stead-Device-Id must be a valid UUIDv4 identifier',
      });

      expect(prisma.user.upsert).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
      expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed device id during verify without looking up the user', async () => {
    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', {
        deviceId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({
      message: 'X-Stead-Device-Id must be a valid UUIDv4 identifier',
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
  });

  it('treats an empty device id as absent and skips device rate-limit counting', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });

    await service.requestOtp('08012345678', 'NG', { deviceId: '' });

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: expect.any(String) as unknown,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        deviceHash: undefined,
      }),
    );
  });
});
