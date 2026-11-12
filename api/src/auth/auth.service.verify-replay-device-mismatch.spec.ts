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
const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const DEVICE_B = '11111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000042';
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService verify OTP replay device fingerprint', () => {
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

  const storedWinner = async (otp: string, deviceId: string) => {
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      { deviceHash: hashDevice(deviceId) },
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

  it('replays the winner session when the same device retries the idempotency key', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, DEVICE_A),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_A,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('replays after trimming and lowercasing a padded UUIDv4 verification key', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, DEVICE_A),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: `  ${IDEMPOTENCY_KEY.toUpperCase()}  `,
        deviceId: DEVICE_A,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(prisma.otpCode.findUnique).toHaveBeenCalledWith({
      where: { verificationKeyHash: hashOtpVerificationKey(IDEMPOTENCY_KEY) },
      select: {
        codeHash: true,
        verificationRequestHash: true,
        verificationResponseJson: true,
        verifiedAt: true,
        user: { select: { phone: true } },
      },
    });
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects replay when a different device reuses the idempotency key', async () => {
    const otp = '123456';
    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, DEVICE_A),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_B,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects replay when device fingerprint presence changes', async () => {
    const otp = '123456';
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const unboundRequestHash = hashOtpVerificationRequest(VERIFICATION_SECRET, {
      deviceHash: null,
    });
    prisma.otpCode.findUnique.mockResolvedValue({
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash: unboundRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        VERIFICATION_SECRET,
        verificationKeyHash,
        unboundRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_A,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.otpCode.findUnique.mockResolvedValue(
      await storedWinner(otp, DEVICE_A),
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a concurrent recheck when the stored winner is bound to another device', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(await storedWinner(otp, DEVICE_A));

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_B,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.otpCode.findFirst).toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
