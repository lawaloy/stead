import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService IP omit branches', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };
  let config: { get: jest.Mock };
  let countries: { requireAuthCountry: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn(),
    };
    telemetry = {
      recordEvent: jest.fn(),
      countRecentEvents: jest.fn().mockResolvedValue(0),
    };
    countries = {
      requireAuthCountry: jest.fn((iso: string) =>
        Promise.resolve({
          iso,
          label: iso,
          dialCode: '+',
          currencyCode: 'NGN',
          phoneExample: '08012345678',
          authEnabled: true,
          marketEnabled: iso === 'NG',
          defaultCountry: iso === 'NG',
        }),
      ),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, number | string | undefined> = {
          DEV_EXPOSE_OTP: 'false',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: jwt },
        { provide: AuthTelemetryService, useValue: telemetry },
        { provide: ConfigService, useValue: config },
        { provide: CountriesService, useValue: countries },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('skips IP request rate-limit counting when context.ip is omitted', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });

    await service.requestOtp('08012345678', 'NG', {});

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.otpCode.count).toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: expect.any(String) as unknown,
    });
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        codeHash: expect.any(String) as unknown,
        expiresAt: expect.any(Date) as unknown,
        ip: undefined,
        userAgent: undefined,
      },
    });
  });

  it('skips IP verify failure counting when context.ip is omitted', async () => {
    const codeHash = await bcrypt.hash('123456', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash,
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockResolvedValue('token');

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', {}),
    ).resolves.toEqual({ token: 'token' });

    expect(telemetry.countRecentEvents).not.toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).toHaveBeenCalledTimes(2);
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
      }),
    );
  });
});
