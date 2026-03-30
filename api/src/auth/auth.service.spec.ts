import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let notifications: { enqueueOtpRequested: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let telemetry: { recordEvent: jest.Mock; countRecentEvents: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    process.env.DEV_EXPOSE_OTP = 'false';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
        codeHash: expect.any(String) as unknown as string,
        expiresAt: expect.any(Date) as unknown as Date,
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
    prisma.otpCode.update.mockResolvedValue({});
    jwt.signAsync.mockResolvedValue('jwt_token');

    const result = await service.verifyOtp('08012345678', 'NG', otp, {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: {
        consumedAt: expect.any(Date) as unknown as Date,
      },
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
        consumedAt: expect.any(Date) as unknown as Date,
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
