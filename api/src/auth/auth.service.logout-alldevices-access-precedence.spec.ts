import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService allDevices logout access-token precedence', () => {
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
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user_refresh',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user_access' }),
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

  it('revokes the access JWT user and ignores a mismatched refresh user', async () => {
    await expect(
      service.revokeSession({
        accessToken: 'access-for-user-access',
        refreshToken: 'refresh-for-user-refresh',
        allDevices: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(jwt.verifyAsync).toHaveBeenCalled();
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    const [[revoke]] = prisma.refreshToken.updateMany.mock.calls as unknown as [
      [
        {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: Date };
        },
      ],
    ];
    expect(revoke.where).toEqual({ userId: 'user_access', revokedAt: null });
  });
});
