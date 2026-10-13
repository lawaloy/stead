import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import { hashRefreshToken } from './refresh-token.util';

describe('AuthService omitted device when device secret is unset', () => {
  let service: AuthService;
  let prisma: {
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access_token') };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };

    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: jwt },
        { provide: AuthTelemetryService, useValue: telemetry },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AUTH_DEVICE_IDENTIFIER_SECRET') {
                return undefined;
              }
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
          useValue: {
            requireAuthCountry: jest.fn((iso: string) =>
              Promise.resolve({
                iso,
                label: iso,
                dialCode: '+',
                currencyCode: 'NGN',
                phoneExample: '08012345678',
                authEnabled: true,
                marketEnabled: true,
                defaultCountry: true,
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('requests an OTP for older clients when the device secret is unset', async () => {
    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.otpCode.create).toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalled();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        deviceHash: undefined,
      }),
    );
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
  });

  it('verifies OTP and issues an unbound session when the device secret is unset', async () => {
    const codeHash = await bcrypt.hash('123456', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash,
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    expect(prisma.refreshToken.create).toHaveBeenCalled();
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { deviceHash: string | null } }],
    ];
    expect(createArg.data.deviceHash).toBeNull();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_succeeded',
        deviceHash: undefined,
      }),
    );
  });

  it('rotates an unbound refresh family when the device secret is unset', async () => {
    const raw = 'refresh-raw-token-value';
    const familyCreatedAt = new Date(Date.now() - 60_000);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_old',
      familyId: 'family_1',
      familyCreatedAt,
      tokenHash: hashRefreshToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      deviceHash: null,
      user: { id: 'user_1', phone: '+2348012345678' },
    });

    await expect(service.refreshSession(raw)).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { deviceHash: string | null; familyId: string } }],
    ];
    expect(createArg.data.familyId).toBe('family_1');
    expect(createArg.data.deviceHash).toBeNull();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt_old' },
      data: {
        replacedById: 'rt_new',
      },
    });
    expect(jwt.signAsync).toHaveBeenCalled();
  });
});
