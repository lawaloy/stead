import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const ENCRYPTION_KEY = 'otp-verification-test-secret-at-least-32-characters';

describe('AuthService process.env AUTH_OTP_MAX_VERIFY_ATTEMPTS ignore', () => {
  let service: AuthService;
  let prisma: {
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
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
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };
  const envKey = 'AUTH_OTP_MAX_VERIFY_ATTEMPTS';
  let previous: string | undefined;

  const compile = async (maxAttempts: number | undefined) => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
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
    };
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
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
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AuthTelemetryService, useValue: telemetry },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string | number | undefined> = {
                AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
                AUTH_OTP_MAX_VERIFY_ATTEMPTS: maxAttempts,
              };
              return values[key];
            }),
          },
        },
        {
          provide: CountriesService,
          useValue: {
            requireAuthCountry: jest.fn().mockResolvedValue({
              iso: 'NG',
              label: 'NG',
              dialCode: '+',
              currencyCode: 'NGN',
              phoneExample: '08012345678',
              authEnabled: true,
              marketEnabled: true,
              defaultCountry: true,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  };

  beforeEach(() => {
    previous = process.env[envKey];
    delete process.env[envKey];
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('locks using ConfigService max attempts even when process.env allows more', async () => {
    await compile(2);
    process.env[envKey] = '99';
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash('123456', 1),
      verifyAttempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', '654321'),
    ).rejects.toMatchObject({
      message: 'Too many invalid OTP attempts. Request a new code.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        verifyAttempts: 2,
        consumedAt: expect.any(Date) as unknown,
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        attemptNumber: 2,
      }),
    );
  });

  it('keeps the default five-attempt lockout when ConfigService omits the limit even if process.env is 1', async () => {
    await compile(undefined);
    process.env[envKey] = '1';
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash('123456', 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', '654321'),
    ).rejects.toMatchObject({
      message: 'Invalid phone or code',
    });

    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        verifyAttempts: 1,
        consumedAt: undefined,
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_failed',
        attemptNumber: 1,
      }),
    );
    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_locked' }),
    );
  });
});
