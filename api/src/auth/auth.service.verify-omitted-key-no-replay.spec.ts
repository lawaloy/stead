import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
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
const WINNER_KEY = '00000000-0000-4000-8000-000000000099';
const WINNER_KEY_HASH = hashOtpVerificationKey(WINNER_KEY);
const WINNER_SESSION = {
  token: 'winner-access-token',
  refreshToken: 'winner-refresh-token',
  expiresIn: 900,
};

describe('AuthService verify OTP omitted idempotency key', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
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

  it('does not replay a stored winner when the client omits the verification key', async () => {
    const otp = '123456';
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      { deviceHash: null },
    );
    const winner = {
      codeHash: await bcrypt.hash(otp, 1),
      verificationRequestHash,
      verificationResponseJson: encryptOtpVerificationResponse(
        VERIFICATION_SECRET,
        WINNER_KEY_HASH,
        verificationRequestHash,
        WINNER_SESSION,
      ),
      verifiedAt: new Date(),
      user: { phone: '+2348012345678' },
    };
    prisma.otpCode.findUnique.mockImplementation(
      (query: { where: { verificationKeyHash: string } }) =>
        query.where.verificationKeyHash === WINNER_KEY_HASH ? winner : null,
    );

    await expect(
      service.verifyOtp('08012345678', 'NG', otp),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyOtp('08012345678', 'NG', otp)).rejects.toThrow(
      'OTP expired or not found',
    );

    const queriedHashes = prisma.otpCode.findUnique.mock.calls.map(
      ([query]: [{ where: { verificationKeyHash: string } }]) =>
        query.where.verificationKeyHash,
    );
    expect(queriedHashes.length).toBeGreaterThan(0);
    expect(queriedHashes).not.toContain(WINNER_KEY_HASH);
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
