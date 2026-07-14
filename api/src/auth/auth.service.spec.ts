import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CountriesService } from '../countries/countries.service';

describe('AuthService', () => {
  let service: AuthService;
  type MockUser = { id: string; phone: string };
  type MockOtpRecord = {
    id: string;
    codeHash?: string;
    verifyAttempts?: number;
    expiresAt?: Date;
    consumedAt?: Date | null;
  };
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
  let notifications: { enqueueOtpRequested: jest.Mock };
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
    notifications = {
      enqueueOtpRequested: jest.fn(),
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
          DEV_EXPOSE_OTP: process.env.DEV_EXPOSE_OTP,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: NotificationsService,
          useValue: notifications,
        },
        {
          provide: JwtService,
          useValue: jwt,
        },
        {
          provide: AuthTelemetryService,
          useValue: telemetry,
        },
        {
          provide: ConfigService,
          useValue: config,
        },
        {
          provide: CountriesService,
          useValue: countries,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    process.env.DEV_EXPOSE_OTP = 'false';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejects otp requests for unsupported auth countries', async () => {
    countries.requireAuthCountry.mockRejectedValue(
      new BadRequestException('countryIso must be supported'),
    );

    await expect(service.requestOtp('08012345678', 'ZZ')).rejects.toThrow(
      'countryIso must be supported',
    );
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('rejects otp requests when phone does not match the selected country', async () => {
    await expect(service.requestOtp('+1 415 555 2671', 'NG')).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.otpCode.count).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(notifications.enqueueOtpRequested).not.toHaveBeenCalled();
  });

  it('normalizes phone numbers, stores metadata, and enqueues otp', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });

    await service.requestOtp('08012345678', 'NG', {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
      update: {},
      create: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        codeHash: expect.any(String) as unknown,
        expiresAt: expect.any(Date) as unknown,
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      },
    });
    expect(notifications.enqueueOtpRequested).toHaveBeenCalledWith(
      '+2348012345678',
      expect.any(String),
    );
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
      }),
    );
  });

  it('still enqueues otp notification jobs when exposing dev otps', async () => {
    process.env.DEV_EXPOSE_OTP = 'true';
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });

    const response = await service.requestOtp('08012345678', 'NG', {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });

    expect(response).toEqual({
      ok: true,
      otp: expect.stringMatching(/^\d{6}$/) as unknown,
    });
    expect(notifications.enqueueOtpRequested).toHaveBeenCalledWith(
      '+2348012345678',
      response.otp,
    );
  });

  it('rate limits otp requests by ip window', async () => {
    telemetry.countRecentEvents.mockResolvedValueOnce(20);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
      }),
    );
    const [recordedRateLimitEvent] = telemetry.recordEvent.mock.calls.at(
      -1,
    ) as [{ metadata?: { scope?: string } }];
    expect(recordedRateLimitEvent.metadata?.scope).toBe('ip');
  });

  it('rate limits otp requests per phone within the hourly window', async () => {
    prisma.otpCode.count.mockResolvedValue(10);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.count).toHaveBeenCalledWith({
      where: {
        user: { phone: '+2348012345678' },
        createdAt: { gte: expect.any(Date) as unknown },
      },
    });
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notifications.enqueueOtpRequested).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
        metadata: { limit: 10, window: '1h' },
      }),
    );
  });

  it('surfaces notification enqueue failures after storing the otp', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });
    notifications.enqueueOtpRequested.mockRejectedValue(
      new Error('queue unavailable'),
    );

    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toThrow('queue unavailable');

    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        codeHash: expect.any(String) as unknown,
        expiresAt: expect.any(Date) as unknown,
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
      }),
    );
  });

  it('rejects otp resend during cooldown window', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp_recent' });

    await expect(service.requestOtp('+2348012345678', 'NG')).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.requestOtp('+2348012345678', 'NG'),
    ).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        phone: '+2348012345678',
        countryIso: 'NG',
      }),
    );
  });

  it('uses configured resend cooldown values', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_OTP_RESEND_COOLDOWN_MS') return 120_000;
      return undefined;
    });
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp_recent' });

    await expect(
      service.requestOtp('+2348012345678', 'NG'),
    ).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        createdAt: { gt: expect.any(Date) as unknown },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_resend_blocked',
        metadata: { cooldownMs: 120_000 },
      }),
    );
  });

  it('normalizes using the selected country', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({
      id: 'user_us',
      phone: '+14155552671',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_us' });

    await service.requestOtp('4155552671', 'US');

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: '+14155552671' },
      update: {},
      create: { phone: '+14155552671' },
    });
  });

  it('rejects otp verification when phone does not match the selected country', async () => {
    await expect(
      service.verifyOtp('+1 415 555 2671', 'NG', '123456'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
  });

  it('verifies otp against normalized phone and returns token', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockResolvedValue('jwt_token');

    const result = await service.verifyOtp('08012345678', 'NG', otp, {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'otp_1',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    );
    expect(result).toEqual({ token: 'jwt_token' });
  });

  it('rejects a valid otp if another request already consumed it', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);
    prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verifyOtp('08012345678', 'NG', otp)).rejects.toThrow(
      BadRequestException,
    );

    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'otp_verify_succeeded' }),
    );
  });

  it('rate limits otp verification failures by ip window', async () => {
    telemetry.countRecentEvents.mockResolvedValueOnce(10);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message:
        'Too many invalid OTP attempts from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
      }),
    );
  });

  it('increments verify attempts for an invalid otp', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash('123456', 1),
      verifyAttempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);
    prisma.otpCode.update.mockResolvedValue({});

    await expect(
      service.verifyOtp('08012345678', 'NG', '654321'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        verifyAttempts: 2,
        consumedAt: undefined,
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_failed',
        phone: '+2348012345678',
        countryIso: 'NG',
        attemptNumber: 2,
      }),
    );
  });

  it('invalidates otp after too many invalid verify attempts', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash('123456', 1),
      verifyAttempts: 4,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);
    prisma.otpCode.update.mockResolvedValue({});

    await expect(
      service.verifyOtp('08012345678', 'NG', '654321'),
    ).rejects.toMatchObject({
      message: 'Too many invalid OTP attempts. Request a new code.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        verifyAttempts: 5,
        consumedAt: expect.any(Date) as unknown,
      },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        phone: '+2348012345678',
        countryIso: 'NG',
        attemptNumber: 5,
      }),
    );
  });

  it('rejects verification when otp is already maxed out', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash('123456', 1),
      verifyAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).rejects.toMatchObject({
      message: 'Too many invalid OTP attempts. Request a new code.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.update).not.toHaveBeenCalled();
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        phone: '+2348012345678',
        countryIso: 'NG',
        attemptNumber: 5,
      }),
    );
  });
});
