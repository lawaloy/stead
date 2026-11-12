import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';
import {
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
} from './otp-verification-idempotency';

const VERIFICATION_SECRET = 'stead-unit-test-otp-verification-key-1234567890';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000043';
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};

describe('AuthService verify OTP persist-blob failure', () => {
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
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
      authEvent: { create: jest.fn() },
      otpCode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_1' }),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('minted-access-token') };
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
            get: jest.fn((key: string) =>
              key === 'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY'
                ? VERIFICATION_SECRET
                : undefined,
            ),
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

  const storedWinner = async (otp: string) => {
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      { deviceHash: null },
    );
    return {
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        VERIFICATION_SECRET,
        verificationKeyHash,
        verificationRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348012345678' },
    };
  };

  const liveOtp = async (otp: string) => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_latest',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
  };

  it('returns the stored winner when persisting the verification blob fails after another request stored it', async () => {
    const otp = '123456';
    await liveOtp(otp);
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(await storedWinner(otp));
    prisma.otpCode.update.mockRejectedValue(
      new Error('verification blob persist failed'),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(prisma.otpCode.update).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });

  it('rethrows the persist failure when no stored winner exists', async () => {
    const otp = '123456';
    const persistError = new Error('verification blob persist failed');
    await liveOtp(otp);
    prisma.otpCode.update.mockRejectedValue(persistError);

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBe(persistError);

    expect(prisma.otpCode.update).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });
});
