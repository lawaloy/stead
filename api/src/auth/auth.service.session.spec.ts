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

describe('AuthService session refresh', () => {
  let service: AuthService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('access_token'),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: 'test-jwt-secret-16',
          JWT_EXPIRES_IN: '15m',
          AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
          AUTH_DEVICE_IDENTIFIER_SECRET: 'device-secret-at-least-32-chars!!',
        };
        return values[key];
      }),
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
        {
          provide: AuthTelemetryService,
          useValue: {
            recordEvent: jest.fn(),
            countRecentEvents: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: config },
        {
          provide: CountriesService,
          useValue: { requireAuthCountry: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rotates a live refresh token and revokes the previous row', async () => {
    const raw = 'refresh-raw-token-value';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    });

    const session = await service.refreshSession(raw);

    expect(session).toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });
    expect(typeof session.refreshToken).toBe('string');
    expect(session.refreshToken.length).toBeGreaterThan(0);
    expect(session.refreshToken).not.toEqual(raw);
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { userId: string; familyId: string } }],
    ];
    expect(createArg.data.userId).toBe('user_1');
    expect(createArg.data.familyId).toBe('family_1');
    const [[updateArg]] = prisma.refreshToken.update.mock.calls as unknown as [
      [
        {
          where: { id: string };
          data: { revokedAt: Date; replacedById: string };
        },
      ],
    ];
    expect(updateArg.where.id).toBe('rt_old');
    expect(updateArg.data.replacedById).toBe('rt_new');
    expect(updateArg.data.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes the whole family when a revoked refresh token is reused', async () => {
    const raw = 'stolen-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      tokenHash: hashRefreshToken(raw),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
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
    expect(familyRevoke.data.revokedAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects expired refresh tokens', async () => {
    const raw = 'expired-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    });

    await expect(service.refreshSession(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const [[expiredUpdate]] = prisma.refreshToken.update.mock
      .calls as unknown as [
      [{ where: { id: string }; data: { revokedAt: Date } }],
    ];
    expect(expiredUpdate.where.id).toBe('rt_old');
    expect(expiredUpdate.data.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes a family by refresh token on logout', async () => {
    const raw = 'logout-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      familyId: 'family_1',
    });

    await expect(service.revokeSession({ refreshToken: raw })).resolves.toEqual(
      { ok: true },
    );
    const [[logoutRevoke]] = prisma.refreshToken.updateMany.mock
      .calls as unknown as [
      [
        {
          where: { familyId: string; revokedAt: null };
          data: { revokedAt: Date };
        },
      ],
    ];
    expect(logoutRevoke.where).toEqual({
      familyId: 'family_1',
      revokedAt: null,
    });
    expect(logoutRevoke.data.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes all live refresh tokens for a user via access token logout', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    await expect(
      service.revokeSession({ accessToken: 'access' }),
    ).resolves.toEqual({ ok: true });
    const [[accessRevoke]] = prisma.refreshToken.updateMany.mock
      .calls as unknown as [
      [
        {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: Date };
        },
      ],
    ];
    expect(accessRevoke.where).toEqual({ userId: 'user_1', revokedAt: null });
    expect(accessRevoke.data.revokedAt).toBeInstanceOf(Date);
  });
});
