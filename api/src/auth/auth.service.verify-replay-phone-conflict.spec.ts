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

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService verify OTP replay phone conflict', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn() };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(99),
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
            requireAuthCountry: jest.fn().mockResolvedValue({ iso: 'NG' }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rejects replay when the stored winner belongs to another phone', async () => {
    const otp = '123456';
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      { deviceHash: hashDevice(DEVICE_ID) },
    );
    prisma.otpCode.findUnique.mockResolvedValue({
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        VERIFICATION_SECRET,
        verificationKeyHash,
        verificationRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348099999999' },
    });

    const replay = service.verifyOtp('08012345678', 'NG', otp, {
      idempotencyKey: IDEMPOTENCY_KEY,
      deviceId: DEVICE_ID,
      ip: '198.51.100.10',
    });
    await expect(replay).rejects.toBeInstanceOf(ConflictException);
    await expect(replay).rejects.toEqual(
      expect.objectContaining({
        message:
          'Idempotency-Key was already used for another OTP verification.',
      }),
    );

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
