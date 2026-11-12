import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

const FROZEN_NOW = new Date('2026-10-11T16:00:00.000Z');
const NINETY_DAYS_MS = 90 * 86_400_000;
const ENV_KEY = 'AUTH_REFRESH_FAMILY_MAX_AGE';
const WHITESPACE_DURATION = ' \t\n ';

describe('AuthService empty vs whitespace refresh family max age', () => {
  let service: AuthService;
  let prisma: {
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let previous: string | undefined;

  const compile = async (familyMaxAge: string) => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
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
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access_token') },
        },
        {
          provide: AuthTelemetryService,
          useValue: {
            recordEvent: jest.fn(),
            countRecentEvents: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: familyMaxAge,
              };
              return values[key];
            }),
          },
        },
        {
          provide: CountriesService,
          useValue: { requireAuthCountry: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  };

  const liveToken = (raw: string, familyCreatedAt: Date) => ({
    id: 'rt_old',
    familyId: 'family_1',
    familyCreatedAt,
    tokenHash: hashRefreshToken(raw),
    revokedAt: null,
    expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
    deviceHash: null as string | null,
    user: { id: 'user_1', phone: '+2348012345678' },
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    previous = process.env[ENV_KEY];
    process.env[ENV_KEY] = '7d';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('defaults an empty family max age to 90d and rejects a whitespace-only max age', async () => {
    await compile('');
    const raw = 'empty-family-max-age-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, new Date(FROZEN_NOW.getTime() - NINETY_DAYS_MS + 1)),
    );

    await expect(service.refreshSession(raw)).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);

    await compile(WHITESPACE_DURATION);
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, new Date(FROZEN_NOW.getTime() - 1)),
    );
    prisma.refreshToken.create.mockClear();
    prisma.refreshToken.updateMany.mockClear();

    await expect(service.refreshSession(raw)).rejects.toThrow(
      `Unsupported duration: ${WHITESPACE_DURATION}`,
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
