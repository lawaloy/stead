import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const FROZEN_NOW = new Date('2026-10-11T17:00:00.000Z');
const ENCRYPTION_KEY = 'otp-verification-test-secret-at-least-32-characters';

describe('AuthService zero token lifetimes', () => {
  let service: AuthService;
  let prisma: {
    $executeRaw: jest.Mock;
    authEvent: { create: jest.Mock };
    $transaction: jest.Mock;
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
      findUnique: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  const configValues: Record<string, string> = {};
  const previousJwtExpiresIn = process.env.JWT_EXPIRES_IN;
  const previousRefreshExpiresIn = process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN = '1d';
    Object.keys(configValues).forEach((key) => {
      delete configValues[key];
    });
    Object.assign(configValues, {
      JWT_SECRET: 'test-jwt-secret-16',
      JWT_EXPIRES_IN: '0s',
      AUTH_REFRESH_TOKEN_EXPIRES_IN: '0d',
      AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
      AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
    });

    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      authEvent: { create: jest.fn() },
      $transaction: jest.fn(),
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
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
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
            get: jest.fn((key: string) => configValues[key]),
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

  afterEach(() => {
    jest.useRealTimers();
    if (previousJwtExpiresIn === undefined) {
      delete process.env.JWT_EXPIRES_IN;
    } else {
      process.env.JWT_EXPIRES_IN = previousJwtExpiresIn;
    }
    if (previousRefreshExpiresIn === undefined) {
      delete process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN;
    } else {
      process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN = previousRefreshExpiresIn;
    }
  });

  const liveOtp = async (otp: string) => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      consumedAt: null,
    });
  };

  it('issues immediately expired access and refresh tokens for zero-duration lifetimes', async () => {
    const otp = '123456';
    await liveOtp(otp);

    await expect(
      service.verifyOtp('08012345678', 'NG', otp),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 0,
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user_1', phone: '+2348012345678' },
      { expiresIn: 0 },
    );

    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { expiresAt: Date } }],
    ];
    expect(createArg.data.expiresAt).toEqual(FROZEN_NOW);
    expect(createArg.data.expiresAt).not.toEqual(
      new Date(FROZEN_NOW.getTime() + 86_400_000),
    );
  });
});
