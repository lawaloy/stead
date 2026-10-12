import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

describe('AuthService logout refresh-token lookup failure', () => {
  let service: AuthService;
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwt = { verifyAsync: jest.fn() };

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

  it('surfaces a refresh-token lookup failure instead of an idempotent logout', async () => {
    const failure = new Error('logout refresh lookup unavailable');
    prisma.refreshToken.findUnique.mockRejectedValue(failure);

    await expect(
      service.revokeSession({ refreshToken: 'live-refresh' }),
    ).rejects.toBe(failure);

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('live-refresh') },
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('does not return ok for all-devices logout when the refresh lookup fails', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const failure = new Error('logout refresh lookup unavailable');
    prisma.refreshToken.findUnique.mockRejectedValue(failure);

    await expect(
      service.revokeSession({
        accessToken: 'expired-access',
        refreshToken: 'live-refresh',
        allDevices: true,
      }),
    ).rejects.toBe(failure);

    expect(jwt.verifyAsync).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('live-refresh') },
      select: { userId: true },
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
