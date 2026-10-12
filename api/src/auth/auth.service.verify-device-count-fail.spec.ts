import { createHmac } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const DEVICE_SECRET = 'test-device-identifier-secret-1234567890';
const VERIFY_CONTEXT = {
  ip: '203.0.113.10',
  deviceId: '11111111-1111-4111-8111-111111111111',
  userAgent: 'jest-agent',
};

const deviceHash = createHmac('sha256', DEVICE_SECRET)
  .update(VERIFY_CONTEXT.deviceId.toLowerCase(), 'utf8')
  .digest('hex');

describe('AuthService verify OTP device rate-limit count failure', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn() };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        { provide: JwtService, useValue: jwt },
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
                AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
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

  it('does not look up or consume an OTP when the device verify-lock query fails after IP', async () => {
    telemetry.countRecentEvents
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('device verify lock count unavailable'));

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', VERIFY_CONTEXT),
    ).rejects.toThrow('device verify lock count unavailable');

    expect(telemetry.countRecentEvents).toHaveBeenCalledTimes(2);
    expect(telemetry.countRecentEvents).toHaveBeenNthCalledWith(1, {
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: expect.any(Date) as unknown,
      ip: VERIFY_CONTEXT.ip,
    });
    expect(telemetry.countRecentEvents).toHaveBeenNthCalledWith(2, {
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: expect.any(Date) as unknown,
      deviceHash,
    });
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
