import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService verify OTP country gate', () => {
  let service: AuthService;
  let countries: { requireAuthCountry: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    authEvent: { create: jest.Mock };
    otpCode: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
      authEvent: { create: jest.fn() },
      otpCode: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    jwt = { signAsync: jest.fn() };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };
    countries = {
      requireAuthCountry: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException('countryIso must be supported'),
        ),
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
              const values: Record<string, string | number> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_REFRESH_MAX_FAMILIES_PER_USER: 5,
                AUTH_DEVICE_IDENTIFIER_SECRET:
                  'test-device-identifier-secret-1234567890',
              };
              return values[key];
            }),
          },
        },
        { provide: CountriesService, useValue: countries },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rejects unsupported countries before user, OTP, or lockout lookups', async () => {
    await expect(
      service.verifyOtp('08012345678', 'ZZ', '123456', {
        ip: '203.0.113.10',
        deviceId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('countryIso must be supported');

    expect(countries.requireAuthCountry).toHaveBeenCalledWith('ZZ');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
