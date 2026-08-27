import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
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
          provide: NOTIFICATION_PUBLISHER,
          useValue: notificationPublisher,
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

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
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
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: expect.any(String) as unknown,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_requested',
        phone: '+2348012345678',
        countryIso: 'NG',
      }),
    );
  });

  it('omits otp from the response when DEV_EXPOSE_OTP is not enabled', async () => {
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

    expect(response).toEqual({ ok: true });
    expect(response).not.toHaveProperty('otp');
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: expect.any(String) as unknown,
    });
  });

  it('securely generates and enqueues otp notification jobs', async () => {
    const insecureRandom = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used for OTP generation');
    });
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
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: response.otp,
    });
    expect(insecureRandom).not.toHaveBeenCalled();
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

  it('rate limits otp requests by keyed device identity', async () => {
    const deviceId = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
    const deviceSecret = 'test-device-identifier-secret-1234567890';
    const deviceHash = createHmac('sha256', deviceSecret)
      .update(deviceId)
      .digest('hex');
    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_DEVICE_IDENTIFIER_SECRET') return deviceSecret;
      if (key === 'AUTH_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR') return 2;
      return undefined;
    });
    telemetry.countRecentEvents.mockResolvedValueOnce(2);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        deviceId,
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests from this device. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_requested'],
      since: expect.any(Date) as unknown,
      deviceHash,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        deviceHash,
        metadata: { limit: 2, window: '1h', scope: 'device' },
      }),
    );
    expect(JSON.stringify(telemetry.recordEvent.mock.calls)).not.toContain(
      deviceId,
    );
    expect(prisma.otpCode.count).not.toHaveBeenCalled();
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
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
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
    notificationPublisher.publishOtpRequested.mockRejectedValue(
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

  it('uses configured otp request limits for ip and phone windows', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR') return 3;
      if (key === 'AUTH_OTP_REQUEST_LIMIT_PER_HOUR') return 4;
      return undefined;
    });

    telemetry.countRecentEvents.mockResolvedValueOnce(3);
    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '203.0.113.10',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        metadata: { limit: 3, window: '1h', scope: 'ip' },
      }),
    );

    telemetry.countRecentEvents.mockResolvedValueOnce(0);
    prisma.otpCode.count.mockResolvedValueOnce(4);
    await expect(
      service.requestOtp('08012345678', 'NG', {
        ip: '203.0.113.10',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message: 'Too many OTP requests. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_request_rate_limited',
        metadata: { limit: 4, window: '1h' },
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
      expect.objectContaining({
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user_1',
      phone: '+2348012345678',
    });
    expect(result).toEqual({ token: 'jwt_token' });
  });

  it('consumes leftover live OTPs for the user after a successful verify', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_new',
      codeHash: await bcrypt.hash(otp, 1),
      verifyAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } satisfies MockOtpRecord);
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockResolvedValue('jwt_token');

    await expect(service.verifyOtp('08012345678', 'NG', otp)).resolves.toEqual({
      token: 'jwt_token',
    });

    expect(prisma.otpCode.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.otpCode.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user_1',
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });

  it('rejects verification when no user exists for the phone', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).rejects.toThrow('Invalid phone or code');

    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects verification when no unconsumed otp remains', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    } satisfies MockUser);
    prisma.otpCode.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456'),
    ).rejects.toThrow('OTP expired or not found');

    expect(jwt.signAsync).not.toHaveBeenCalled();
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

    expect(prisma.otpCode.updateMany).toHaveBeenCalledTimes(1);
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

  it('rate limits otp verification failures by keyed device identity', async () => {
    const deviceId = '908de9d7-7c80-4275-a255-a5f6e1f7246f';
    const deviceSecret = 'test-device-identifier-secret-1234567890';
    const deviceHash = createHmac('sha256', deviceSecret)
      .update(deviceId)
      .digest('hex');
    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_DEVICE_IDENTIFIER_SECRET') return deviceSecret;
      if (key === 'AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW') return 3;
      if (key === 'AUTH_OTP_VERIFY_FAILURE_WINDOW_MS') return 60_000;
      return undefined;
    });
    telemetry.countRecentEvents.mockResolvedValueOnce(3);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', { deviceId }),
    ).rejects.toMatchObject({
      message:
        'Too many invalid OTP attempts from this device. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: expect.any(Date) as unknown,
      deviceHash,
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        deviceHash,
        metadata: {
          reason: 'device_window_limit_reached',
          limit: 3,
          windowMs: 60_000,
        },
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('uses configured verify failure ip window limits', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-24T12:00:00.000Z'));

    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW') return 2;
      if (key === 'AUTH_OTP_VERIFY_FAILURE_WINDOW_MS') return 5 * 60 * 1000;
      return undefined;
    });
    telemetry.countRecentEvents.mockResolvedValueOnce(2);

    await expect(
      service.verifyOtp('08012345678', 'NG', '123456', {
        ip: '198.51.100.7',
        userAgent: 'jest-agent',
      }),
    ).rejects.toMatchObject({
      message:
        'Too many invalid OTP attempts from this network. Try again later.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(telemetry.countRecentEvents).toHaveBeenCalledWith({
      types: ['otp_verify_failed', 'otp_verify_locked'],
      since: new Date('2026-07-24T11:55:00.000Z'),
      ip: '198.51.100.7',
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        attemptNumber: 2,
        metadata: {
          reason: 'ip_window_limit_reached',
          limit: 2,
          windowMs: 5 * 60 * 1000,
        },
      }),
    );

    jest.useRealTimers();
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
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) as unknown },
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

  it('uses configured max verify attempts for lockout', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AUTH_OTP_MAX_VERIFY_ATTEMPTS') return 2;
      return undefined;
    });
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
    ).rejects.toMatchObject({
      message: 'Too many invalid OTP attempts. Request a new code.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        verifyAttempts: 2,
        consumedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'otp_verify_locked',
        phone: '+2348012345678',
        countryIso: 'NG',
        attemptNumber: 2,
      }),
    );
  });
});
