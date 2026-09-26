import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService JWT failure after OTP consume', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
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

  it('consumes the OTP and leftover codes before a JWT signing failure', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockRejectedValue(new Error('signing failed'));

    await expect(service.verifyOtp('08012345678', 'NG', otp)).rejects.toThrow(
      'signing failed',
    );

    expect(prisma.otpCode.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'otp_1',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(prisma.otpCode.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user_1',
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_succeeded' }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      {
        sub: 'user_1',
        phone: '+2348012345678',
      },
      { expiresIn: 900 },
    );
  });
});
