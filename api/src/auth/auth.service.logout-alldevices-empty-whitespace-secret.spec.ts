import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService allDevices logout empty vs whitespace JWT_SECRET', () => {
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  const serviceFor = async (secret: string) => {
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
            get: jest.fn((key: string) =>
              key === 'JWT_SECRET' ? secret : undefined,
            ),
          },
        },
        {
          provide: CountriesService,
          useValue: { requireAuthCountry: jest.fn() },
        },
      ],
    }).compile();

    return module.get<AuthService>(AuthService);
  };

  it('skips all-device revoke for an empty JWT_SECRET and revokes with a whitespace-only secret', async () => {
    const emptyService = await serviceFor('');

    await expect(
      emptyService.revokeSession({
        accessToken: 'any-bearer',
        allDevices: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();

    const whitespaceSecret = ' \t\n ';
    const whitespaceService = await serviceFor(whitespaceSecret);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_whitespace' });

    await expect(
      whitespaceService.revokeSession({
        accessToken: 'whitespace-signed-access',
        allDevices: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(jwt.verifyAsync).toHaveBeenCalledWith('whitespace-signed-access', {
      secret: whitespaceSecret,
    });
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_whitespace', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
});
