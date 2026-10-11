import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

const FROZEN_NOW = new Date('2026-10-11T17:30:00.000Z');
const SEVEN_DAYS_MS = 7 * 86_400_000;

describe('AuthService refresh rotation token lifetime', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findFirst: jest.Mock;
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
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);

    prisma = {
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
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access_token') },
        },
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
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '7d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_REFRESH_MAX_FAMILIES_PER_USER: 5,
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stamps familyCreatedAt on the first refresh row issued by verify', async () => {
    const otp = '123456';
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      consumedAt: null,
    });

    await service.verifyOtp('08012345678', 'NG', otp);

    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { familyCreatedAt: Date; expiresAt: Date } }],
    ];
    expect(createArg.data.familyCreatedAt).toEqual(FROZEN_NOW);
    expect(createArg.data.expiresAt).toEqual(
      new Date(FROZEN_NOW.getTime() + SEVEN_DAYS_MS),
    );
  });

  it('applies AUTH_REFRESH_TOKEN_EXPIRES_IN to the rotated row and keeps familyCreatedAt', async () => {
    const raw = 'live-refresh';
    const familyCreatedAt = new Date(FROZEN_NOW.getTime() - 60_000);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      familyCreatedAt,
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    });

    await expect(service.refreshSession(raw)).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [
        {
          data: {
            familyId: string;
            familyCreatedAt: Date;
            expiresAt: Date;
          };
        },
      ],
    ];
    expect(createArg.data.familyId).toBe('family_1');
    expect(createArg.data.familyCreatedAt).toEqual(familyCreatedAt);
    expect(createArg.data.expiresAt).toEqual(
      new Date(FROZEN_NOW.getTime() + SEVEN_DAYS_MS),
    );
  });
});
