import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService verify OTP telemetry transaction client', () => {
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
  let transaction: typeof prisma;
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  const createClient = () => ({
    $executeRaw: jest.fn().mockResolvedValue(1),
    authEvent: { create: jest.fn() },
    otpCode: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user_1',
        phone: '+2348012345678',
      }),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt_1' }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      ...createClient(),
    };
    transaction = createClient();
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    );
    jwt = { signAsync: jest.fn().mockResolvedValue('access_token') };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
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

  it('records otp_verify_succeeded on the transaction client, not root Prisma', async () => {
    const otp = '123456';
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', otp),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
        countryIso: 'NG',
        userId: 'user_1',
        otpCodeId: 'otp_1',
      }),
      transaction,
    );
    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      prisma,
    );
    expect(prisma.authEvent.create).not.toHaveBeenCalled();
    expect(transaction.otpCode.updateMany).toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
  });
});
