import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

const DEVICE_SECRET = 'device-secret-at-least-32-chars!!';
const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService refresh expiry vs unbound families', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
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
                AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
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

  const liveToken = (raw: string, overrides: Record<string, unknown> = {}) => ({
    id: 'rt_old',
    familyId: 'family_1',
    familyCreatedAt: new Date(Date.now() - 60_000),
    tokenHash: hashRefreshToken(raw),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    deviceHash: null as string | null,
    user: { id: 'user_1', phone: '+2348012345678' },
    ...overrides,
  });

  it('revokes only the expired row and leaves sibling family members live', async () => {
    const raw = 'expired-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { expiresAt: new Date(Date.now() - 1_000) }),
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

  it('rotates an unbound family without a device header', async () => {
    const raw = 'unbound-refresh';
    const familyCreatedAt = new Date(Date.now() - 60_000);
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { familyCreatedAt }),
    );

    await expect(service.refreshSession(raw)).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [
        {
          data: {
            familyId: string;
            familyCreatedAt: Date;
            deviceHash: string | null;
          };
        },
      ],
    ];
    expect(createArg.data.familyId).toBe('family_1');
    expect(createArg.data.familyCreatedAt).toEqual(familyCreatedAt);
    expect(createArg.data.deviceHash).toBeNull();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('binds an unbound family when refresh includes a device id', async () => {
    const raw = 'unbound-refresh-bind';
    prisma.refreshToken.findUnique.mockResolvedValue(liveToken(raw));

    await expect(
      service.refreshSession(raw, { deviceId: DEVICE_A }),
    ).resolves.toMatchObject({ token: 'access_token' });
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { deviceHash: string | null } }],
    ];
    expect(createArg.data.deviceHash).toBe(hashDevice(DEVICE_A));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });
});
