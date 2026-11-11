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
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000041';
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};

describe('AuthService verify OTP issue-session catch replay', () => {
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
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn() };
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

  it('returns the winner session when consume loses after a live OTP was selected', async () => {
    const otp = '123456';
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
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(await storedWinner(otp));
    prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(prisma.otpCode.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('returns the winner session when the verification transaction fails after another request stored the response', async () => {
    const otp = '123456';
    const transactionError = new Error('refresh family slot failed');
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
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(await storedWinner(otp));
    prisma.otpCode.updateMany.mockRejectedValue(transactionError);

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('returns the winner session when JWT signing fails after consume and another request stored the response', async () => {
    const otp = '123456';
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
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(await storedWinner(otp));
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt_1' });
    jwt.signAsync.mockRejectedValue(new Error('signing failed'));

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
  });

  it('surfaces a catch-path replay conflict instead of the original signing failure', async () => {
    const otp = '123456';
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
    prisma.otpCode.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(
      await storedWinner(otp).then((winner) => ({
        ...winner,
        verifiedAt: new Date(Date.now() - 10 * 60 * 1000 - 1),
      })),
    );
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt_1' });
    jwt.signAsync.mockRejectedValue(new Error('signing failed'));

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'The OTP verification replay window has expired.',
      }),
    );

    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });
});
