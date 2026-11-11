import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { ConflictException } from '@nestjs/common';
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
const DEVICE_SECRET = 'device-secret-at-least-32-chars!!';
const DEVICE_ID = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000042';
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
const NOW = new Date('2026-11-11T19:00:00.000Z');

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService verify OTP replay window and request fingerprint', () => {
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
  };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

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
    };
    jwt = { signAsync: jest.fn() };

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
            countRecentEvents: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: VERIFICATION_SECRET,
                AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
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

  afterEach(() => {
    jest.useRealTimers();
  });

  const storedWinner = async (
    otp: string,
    overrides: {
      verifiedAt?: Date | null;
      verificationResponseJson?: string | null;
      verificationRequestHash?: string | null;
    } = {},
  ) => {
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      { deviceHash: hashDevice(DEVICE_ID) },
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
      verifiedAt: NOW,
      user: { phone: '+2348012345678' },
      ...overrides,
    };
  };

  const verify = (otp: string) =>
    service.verifyOtp('08012345678', 'NG', otp, {
      idempotencyKey: IDEMPOTENCY_KEY,
      deviceId: DEVICE_ID,
    });

  it('rejects replay when the stored winner is older than the replay window', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, {
        verifiedAt: new Date(NOW.getTime() - REPLAY_WINDOW_MS - 1),
      }),
    );

    await expect(verify(otp)).rejects.toEqual(
      expect.objectContaining({
        message: 'The OTP verification replay window has expired.',
      }),
    );
    await expect(verify(otp)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects replay when the stored winner is missing its encrypted session', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, { verificationResponseJson: null }),
    );

    await expect(verify(otp)).rejects.toEqual(
      expect.objectContaining({
        message: 'The OTP verification replay window has expired.',
      }),
    );
    await expect(verify(otp)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects replay when the stored request fingerprint is missing', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, { verificationRequestHash: null }),
    );

    await expect(verify(otp)).rejects.toEqual(
      expect.objectContaining({
        message:
          'Idempotency-Key was already used for another OTP verification.',
      }),
    );
    await expect(verify(otp)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
