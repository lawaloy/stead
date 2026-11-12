import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const VERIFICATION_SECRET = 'stead-unit-test-otp-verification-key-1234567890';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000042';

describe('AuthService verify OTP replay row lookup failure', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
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
        update: jest.fn(),
        updateMany: jest.fn(),
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
                AUTH_OTP_VERIFICATION_ENCRYPTION_KEY: VERIFICATION_SECRET,
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

  it('surfaces an initial replay lookup failure instead of minting a live session', async () => {
    prisma.otpCode.findUnique.mockRejectedValue(
      new Error('verify replay lookup unavailable'),
    );

    const error = await service
      .verifyOtp('08012345678', 'NG', '123456', {
        idempotencyKey: IDEMPOTENCY_KEY,
        ip: '203.0.113.10',
        userAgent: 'jest-agent',
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'verify replay lookup unavailable');
    expect(error).not.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(error).not.toMatchObject({
      message: 'OTP expired or not found',
    });

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.findUnique).toHaveBeenCalledWith({
      where: {
        verificationKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
      },
      select: {
        codeHash: true,
        verificationRequestHash: true,
        verificationResponseJson: true,
        verifiedAt: true,
        user: { select: { phone: true } },
      },
    });
    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('surfaces a concurrent recheck lookup failure instead of reporting an expired OTP', async () => {
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('concurrent replay lookup unavailable'));
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);

    const error = await service
      .verifyOtp('08012345678', 'NG', '123456', {
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty(
      'message',
      'concurrent replay lookup unavailable',
    );
    expect(error).not.toMatchObject({
      message: 'OTP expired or not found',
    });
    expect(error).not.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });

    expect(prisma.otpCode.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalled();
  });
});
