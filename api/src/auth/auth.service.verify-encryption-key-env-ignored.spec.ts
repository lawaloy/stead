import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
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

const CONFIG_SECRET = 'stead-unit-test-otp-verification-key-config';
const ENV_SECRET = 'stead-unit-test-otp-verification-key-envxx';
const DEVICE_SECRET = 'device-secret-at-least-32-chars!!';
const DEVICE_ID = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000043';
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService process.env AUTH_OTP_VERIFICATION_ENCRYPTION_KEY ignore', () => {
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
  const envKey = 'AUTH_OTP_VERIFICATION_ENCRYPTION_KEY';
  let previous: string | undefined;

  beforeEach(async () => {
    previous = process.env[envKey];
    process.env[envKey] = ENV_SECRET;
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
              const values: Record<string, string> = {
                AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: CONFIG_SECRET,
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

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previous;
    }
  });

  it('replays a session encrypted with ConfigService even when process.env has a different key', async () => {
    const otp = '123456';
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(CONFIG_SECRET, {
      deviceHash: hashDevice(DEVICE_ID),
    });
    prisma.otpCode.findUnique.mockResolvedValue({
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        CONFIG_SECRET,
        verificationKeyHash,
        verificationRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_ID,
      }),
    ).resolves.toEqual(WINNER_SESSION);

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a blob encrypted with process.env when ConfigService has a different key', async () => {
    const otp = '123456';
    const verificationKeyHash = hashOtpVerificationKey(IDEMPOTENCY_KEY);
    const verificationRequestHash = hashOtpVerificationRequest(CONFIG_SECRET, {
      deviceHash: hashDevice(DEVICE_ID),
    });
    prisma.otpCode.findUnique.mockResolvedValue({
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        ENV_SECRET,
        verificationKeyHash,
        verificationRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.verifyOtp('08012345678', 'NG', otp, {
        idempotencyKey: IDEMPOTENCY_KEY,
        deviceId: DEVICE_ID,
      }),
    ).rejects.toThrow('Unable to decrypt OTP verification response');

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
