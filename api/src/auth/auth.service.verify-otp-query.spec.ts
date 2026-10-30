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

describe('AuthService verify OTP selection query', () => {
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
      findUnique: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
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
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_1' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
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

  it('loads the newest live unexpired OTP rather than any matching row', async () => {
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
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockResolvedValue('jwt_token');

    const session = await service.verifyOtp('08012345678', 'NG', otp);
    expect(session).toMatchObject({
      token: 'jwt_token',
      expiresIn: 900,
    });
    expect(typeof session.refreshToken).toBe('string');
    expect(session.refreshToken.length).toBeGreaterThan(0);

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not consume codes or mint a session when no live OTP remains', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).rejects.toThrow('OTP expired or not found');

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rechecks replay after a concurrent winner consumes the live OTP', async () => {
    const idempotencyKey = '00000000-0000-4000-8000-000000000001';
    const verificationKeyHash = hashOtpVerificationKey(idempotencyKey);
    const verificationRequestHash = hashOtpVerificationRequest(
      VERIFICATION_SECRET,
      {
        phone: '+2348012345678',
        countryIso: 'NG',
        otp: '123456',
        deviceHash: null,
      },
    );
    const original = {
      token: 'winner-access-token',
      refreshToken: 'winner-refresh-token',
      expiresIn: 900,
    };
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        verificationRequestHash,
        verificationResponseJson: encryptOtpVerificationResponse(
          VERIFICATION_SECRET,
          verificationKeyHash,
          verificationRequestHash,
          original,
        ),
        verifiedAt: new Date(),
      });

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', { idempotencyKey }),
    ).resolves.toEqual(original);

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
