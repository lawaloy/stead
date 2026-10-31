import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService family-cap eviction then refresh create failure', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    authEvent: { create: jest.Mock };
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      authEvent: { create: jest.fn() },
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn() };
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
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        { provide: JwtService, useValue: jwt },
        { provide: AuthTelemetryService, useValue: telemetry },
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
                AUTH_DEVICE_IDENTIFIER_SECRET:
                  'test-device-identifier-secret-1234567890',
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

    service = module.get<AuthService>(AuthService);
  });

  it('consumes the OTP and evicts the oldest family before a refresh-row create failure', async () => {
    const otp = '123456';
    const createFail = new Error('refresh create unavailable after eviction');
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.groupBy.mockResolvedValue([
      {
        familyId: 'fam-oldest',
        _min: { familyCreatedAt: new Date('2024-01-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-2',
        _min: { familyCreatedAt: new Date('2024-02-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-3',
        _min: { familyCreatedAt: new Date('2024-03-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-4',
        _min: { familyCreatedAt: new Date('2024-04-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-5',
        _min: { familyCreatedAt: new Date('2024-05-01T00:00:00.000Z') },
      },
    ]);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockRejectedValue(createFail);

    await expect(service.verifyOtp('08012345678', 'NG', otp)).rejects.toBe(
      createFail,
    );

    expect(prisma.otpCode.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'otp_1',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(prisma.otpCode.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user_1',
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_succeeded' }),
      expect.anything(),
    );
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.groupBy).toHaveBeenCalledWith({
      by: ['familyId'],
      where: { userId: 'user_1', revokedAt: null },
      _min: { familyCreatedAt: true },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-oldest', userId: 'user_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
