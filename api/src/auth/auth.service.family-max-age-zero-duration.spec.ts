import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

const FROZEN_NOW = new Date('2026-10-11T16:00:00.000Z');
const ENV_KEY = 'AUTH_REFRESH_FAMILY_MAX_AGE';

describe('AuthService zero-duration refresh family max age', () => {
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

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    previous = process.env[ENV_KEY];
    process.env[ENV_KEY] = '90d';

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
                AUTH_REFRESH_FAMILY_MAX_AGE: '0d',
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
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('revokes a live family immediately when max age is 0d instead of defaulting to 90d', async () => {
    const raw = 'zero-duration-family-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      familyCreatedAt: new Date(FROZEN_NOW.getTime() - 1),
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    });

    await expect(service.refreshSession(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const [[familyRevoke]] = prisma.refreshToken.updateMany.mock
      .calls as unknown as [
      [
        {
          where: { familyId: string; revokedAt: null };
          data: { revokedAt: Date };
        },
      ],
    ];
    expect(familyRevoke.where).toEqual({
      familyId: 'family_1',
      revokedAt: null,
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });
});
