import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService verify OTP user lookup failure', () => {
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
      countRecentEvents: jest.fn().mockResolvedValue(0),
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

  it('does not look up or consume an OTP when the user lookup fails after the verify-lock query', async () => {
    prisma.user.findUnique.mockRejectedValue(
      new Error('verify user lookup unavailable'),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', {
        ip: '203.0.113.10',
        userAgent: 'jest-agent',
      }),
    ).rejects.toThrow('verify user lookup unavailable');

    expect(telemetry.countRecentEvents).toHaveBeenCalledTimes(1);
    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: expect.any(Date) as unknown,
      ip: '203.0.113.10',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
    });
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
