import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService logout with a superseded refresh token', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { verifyAsync: jest.fn() };

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

  it('still revokes the family when the presented refresh row is already revoked', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      revokedAt: new Date('2026-10-11T16:00:00.000Z'),
      replacedById: 'rt_new',
    });

    await expect(
      service.revokeSession({ refreshToken: 'rotated-predecessor' }),
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
    expect(logoutRevoke.data.revokedAt).toBeInstanceOf(Date);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});
