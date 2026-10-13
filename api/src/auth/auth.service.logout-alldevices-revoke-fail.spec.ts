import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService allDevices logout revoke write failure', () => {
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
        updateMany: jest.fn(),
      },
    };
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user_access' }) };

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

  it('does not report all-devices logout success when the revoke write fails', async () => {
    const failure = new Error('all-devices revoke unavailable');
    prisma.refreshToken.updateMany.mockRejectedValue(failure);

    await expect(
      service.revokeSession({
        accessToken: 'access-for-user-access',
        allDevices: true,
      }),
    ).rejects.toBe(failure);

    expect(jwt.verifyAsync).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_access', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
});
