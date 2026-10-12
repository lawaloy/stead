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

describe('AuthService expired refresh replay', () => {
  let service: AuthService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn() };

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
              const values: Record<string, string | number> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_REFRESH_MAX_FAMILIES_PER_USER: 5,
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

  it('revokes only the expired row first, then the family on replay', async () => {
    const raw = 'expired-then-replayed';
    const expired = {
      id: 'rt_old',
      familyId: 'family_1',
      familyCreatedAt: new Date(Date.now() - 60_000),
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    };

    prisma.refreshToken.findUnique.mockResolvedValueOnce(expired);

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
    expect(jwt.signAsync).not.toHaveBeenCalled();

    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      ...expired,
      revokedAt: expiredUpdate.data.revokedAt,
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
    expect(prisma.refreshToken.update).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
