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
const FAMILY_MAX_AGE_MS = 90 * 86_400_000;

describe('AuthService refresh age and expiry boundaries', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);

    prisma = {
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
          useValue: { requireAuthCountry: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const liveToken = (raw: string, overrides: Record<string, unknown> = {}) => ({
    id: 'rt_old',
    familyId: 'family_1',
    familyCreatedAt: new Date(FROZEN_NOW.getTime() - 60_000),
    tokenHash: hashRefreshToken(raw),
    revokedAt: null,
    expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
    deviceHash: null as string | null,
    user: { id: 'user_1', phone: '+2348012345678' },
    ...overrides,
  });

  it('revokes the family when familyCreatedAt is exactly the 90-day max age', async () => {
    const raw = 'max-age-exact-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, {
        familyCreatedAt: new Date(FROZEN_NOW.getTime() - FAMILY_MAX_AGE_MS),
      }),
    );

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

  it('rotates when the family is 1ms younger than the 90-day max age', async () => {
    const raw = 'max-age-under-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, {
        familyCreatedAt: new Date(FROZEN_NOW.getTime() - FAMILY_MAX_AGE_MS + 1),
      }),
    );

    await expect(service.refreshSession(raw)).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('revokes only the row when expiresAt is exactly now', async () => {
    const raw = 'expires-at-now-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { expiresAt: new Date(FROZEN_NOW.getTime()) }),
    );

    await expect(service.refreshSession(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const [[expiredUpdate]] = prisma.refreshToken.update.mock
      .calls as unknown as [
      [{ where: { id: string }; data: { revokedAt: Date } }],
    ];
    expect(expiredUpdate.where.id).toBe('rt_old');
    expect(expiredUpdate.data.revokedAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
