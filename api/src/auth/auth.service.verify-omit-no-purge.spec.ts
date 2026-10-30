import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService verify OTP without a device does not purge families', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    authEvent: { create: jest.Mock };
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
      authEvent: { create: jest.fn() },
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findMany: jest.fn().mockResolvedValue([{ familyId: 'fam-bound' }]),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access_token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        { provide: JwtService, useValue: jwt },
        {
          provide: AuthTelemetryService,
          useValue: {
            recordEvent: jest.fn(),
            countRecentEvents: jest.fn().mockResolvedValue(0),
          },
        },
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

  const readyOtp = async (otp = '123456') => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    return otp;
  };

  it.each([
    ['omitted device context', undefined],
    ['empty device id', { deviceId: '' }],
  ])(
    'does not look up or revoke same-device families when the device is %s',
    async (_label, context) => {
      const otp = await readyOtp();

      await expect(
        service.verifyOtp('08012345678', 'NG', otp, context),
      ).resolves.toMatchObject({
        token: 'access_token',
        expiresIn: 900,
      });

      expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      const [[createArg]] = prisma.refreshToken.create.mock
        .calls as unknown as [[{ data: { deviceHash: string | null } }]];
      expect(createArg.data.deviceHash).toBeNull();
    },
  );
});
