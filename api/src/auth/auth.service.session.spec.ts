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
const DEVICE_B = '1a92d3b8-2f7e-4a16-8b2d-14ef9b6c7c88';

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

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
          AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
          AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
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

  it('rotates a live refresh token and revokes the previous row', async () => {
    const raw = 'refresh-raw-token-value';
    const familyCreatedAt = new Date(Date.now() - 60_000);
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { familyCreatedAt }),
    );

    const session = await service.refreshSession(raw, { deviceId: DEVICE_A });

    expect(session).toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });
    expect(typeof session.refreshToken).toBe('string');
    expect(session.refreshToken.length).toBeGreaterThan(0);
    expect(session.refreshToken).not.toEqual(raw);
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [
        {
          data: {
            userId: string;
            familyId: string;
            familyCreatedAt: Date;
            deviceHash: string | null;
          };
        },
      ],
    ];
    expect(createArg.data.userId).toBe('user_1');
    expect(createArg.data.familyId).toBe('family_1');
    expect(createArg.data.familyCreatedAt).toEqual(familyCreatedAt);
    expect(createArg.data.deviceHash).toBe(hashDevice(DEVICE_A));
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

  it('rejects refresh when the family exceeds its absolute max age', async () => {
    const raw = 'aged-family-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, {
        familyCreatedAt: new Date(Date.now() - 91 * 86_400_000),
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
  });

  it('rejects refresh from a different device without revoking the family', async () => {
    const raw = 'device-bound-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { deviceHash: hashDevice(DEVICE_A) }),
    );

    await expect(
      service.refreshSession(raw, { deviceId: DEVICE_B }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects refresh when the family is device-bound but no device is sent', async () => {
    const raw = 'device-bound-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { deviceHash: hashDevice(DEVICE_A) }),
    );

    await expect(service.refreshSession(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rotates when the same device presents a bound refresh token', async () => {
    const raw = 'same-device-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { deviceHash: hashDevice(DEVICE_A) }),
    );

    await expect(
      service.refreshSession(raw, { deviceId: DEVICE_A }),
    ).resolves.toMatchObject({ token: 'access_token', expiresIn: 900 });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('revokes the whole family when a revoked refresh token is reused', async () => {
    const raw = 'stolen-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue(
      liveToken(raw, { revokedAt: new Date() }),
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
    expect(familyRevoke.data.revokedAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects expired refresh tokens', async () => {
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

  it('does not revoke all devices on access-token-only logout', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    await expect(
      service.revokeSession({ accessToken: 'access' }),
    ).resolves.toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokes all live refresh tokens when allDevices is set', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    await expect(
      service.revokeSession({ accessToken: 'access', allDevices: true }),
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

  it('resolves allDevices logout from a refresh token when access is absent', async () => {
    const raw = 'logout-all-refresh';
    prisma.refreshToken.findUnique.mockResolvedValue({
      userId: 'user_1',
    });

    await expect(
      service.revokeSession({ refreshToken: raw, allDevices: true }),
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
});
