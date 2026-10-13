import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService revokeSession credential matrix', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
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
        { provide: JwtService, useValue: jwt },
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

  it('rejects logout with no session credential', async () => {
    await expect(service.revokeSession({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('treats an unknown refresh token as an idempotent logout', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.revokeSession({ refreshToken: 'unknown-refresh' }),
    ).resolves.toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('treats an invalid access-only logout as idempotent without revoking families', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      service.revokeSession({ accessToken: 'expired-access' }),
    ).resolves.toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('prefers the refresh token when both credentials are sent without allDevices', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      familyId: 'family_1',
    });
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      service.revokeSession({
        refreshToken: 'live-refresh',
        accessToken: 'expired-access',
      }),
    ).resolves.toEqual({ ok: true });

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
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('resolves allDevices from refresh when the access token is invalid', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    prisma.refreshToken.findUnique.mockResolvedValue({
      userId: 'user_1',
    });

    await expect(
      service.revokeSession({
        accessToken: 'expired-access',
        refreshToken: 'live-refresh',
        allDevices: true,
      }),
    ).resolves.toEqual({ ok: true });

    const [[revoke]] = prisma.refreshToken.updateMany.mock.calls as unknown as [
      [
        {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: Date };
        },
      ],
    ];
    expect(revoke.where).toEqual({ userId: 'user_1', revokedAt: null });
  });

  it('returns ok without writes when allDevices cannot resolve a user', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.revokeSession({
        accessToken: 'expired-access',
        refreshToken: 'unknown-refresh',
        allDevices: true,
      }),
    ).resolves.toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
