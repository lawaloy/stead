import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const SHARED_CONTEXT = {
  ip: '203.0.113.10',
  deviceId: '11111111-1111-4111-8111-111111111111',
  userAgent: 'jest-agent',
};

describe('AuthService OTP resend cooldown phone scope', () => {
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
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_phone_b' }),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { upsert: jest.fn() },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn().mockResolvedValue(undefined),
    };
    telemetry = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
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
              const values: Record<string, string> = {
                AUTH_DEVICE_IDENTIFIER_SECRET:
                  'test-device-identifier-secret-1234567890',
                DEV_EXPOSE_OTP: 'false',
              };
              return values[key];
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

    service = module.get(AuthService);
  });

  it("does not apply one phone's resend cooldown to a different phone on the same device", async () => {
    prisma.user.upsert
      .mockResolvedValueOnce({
        id: 'user_a',
        phone: '+2348012345678',
      })
      .mockResolvedValueOnce({
        id: 'user_b',
        phone: '+2348098765432',
      });
    prisma.otpCode.findFirst
      .mockResolvedValueOnce({
        id: 'otp_phone_a',
        requestKeyHash: 'other-key',
        requestCompletedAt: new Date('2026-09-07T09:59:00.000Z'),
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ...SHARED_CONTEXT,
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Please wait before requesting another OTP.',
    });

    await expect(
      service.requestOtp('08098765432', 'NG', {
        ...SHARED_CONTEXT,
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.otpCode.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user_a',
        createdAt: { gt: expect.any(Date) as unknown },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.otpCode.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user_b',
        createdAt: { gt: expect.any(Date) as unknown },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_b',
      }) as unknown,
    });
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_b',
        otpCodeId: 'otp_phone_b',
        payload: {
          phone: '+2348098765432',
          otp: expect.any(String) as unknown,
        },
      }),
    );
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        phone: '+2348012345678',
        userId: 'user_a',
        otpCodeId: 'otp_phone_a',
      }),
    );
    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        phone: '+2348098765432',
      }),
    );
  });
});
