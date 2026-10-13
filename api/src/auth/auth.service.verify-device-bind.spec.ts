import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const DEVICE_SECRET = 'device-secret-at-least-32-chars!!';
const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService verify OTP device binding', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    otpCode: {
      findFirst: jest.Mock;
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
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      otpCode: {
        findFirst: jest.fn(),
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
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access_token') };

    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );

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

  it('stores deviceHash on the refresh token when verify includes a valid device id', async () => {
    const otp = await readyOtp();

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, { deviceId: DEVICE_A }),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [
        {
          data: {
            userId: string;
            familyId: string;
            deviceHash: string | null;
          };
        },
      ],
    ];
    expect(createArg.data.userId).toBe('user_1');
    expect(createArg.data.deviceHash).toBe(hashDevice(DEVICE_A));
    expect(createArg.data.familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        deviceHash: hashDevice(DEVICE_A),
        revokedAt: null,
      },
      distinct: ['familyId'],
      select: { familyId: true },
    });
  });

  it('revokes existing same-device refresh families before issuing a session on verify', async () => {
    const otp = await readyOtp();
    prisma.refreshToken.findMany.mockResolvedValue([
      { familyId: 'fam-on-device-a' },
    ]);

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, { deviceId: DEVICE_A }),
    ).resolves.toMatchObject({ token: 'access_token' });

    const [[revokeArg]] = prisma.refreshToken.updateMany.mock
      .calls as unknown as [[{ where: { familyId: string; revokedAt: null } }]];
    expect(revokeArg.where).toEqual({
      familyId: 'fam-on-device-a',
      revokedAt: null,
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { familyId: string } }],
    ];
    expect(createArg.data.familyId).not.toBe('fam-on-device-a');
  });
});
