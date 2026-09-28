import { ConflictException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';

const IDEMPOTENCY_KEY = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

describe('AuthService OTP request idempotency', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: { publishOtpRequested: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'otp_1' }),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
      },
    };
    notificationPublisher = { publishOtpRequested: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PUBLISHER, useValue: notificationPublisher },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
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
              key === 'DEV_EXPOSE_OTP' ? 'true' : undefined,
            ),
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

  it('replays a completed logical request without creating or sending another OTP', async () => {
    const first = await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: first.otp,
      user: { phone: '+2348012345678' },
    });

    const replay = await service.requestOtp('08012345678', 'NG', {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(replay).toEqual(first);
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: { requestCompletedAt: expect.any(Date) as Date },
    });
  });

  it('rejects reuse of an idempotency key for another phone', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: new Date(),
      developmentOtp: '123456',
      user: { phone: '+2348099999999' },
    });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('returns a retryable response while the original request is processing', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('replays the winning request when concurrent inserts collide', async () => {
    prisma.otpCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        requestCompletedAt: new Date(),
        developmentOtp: '123456',
        user: { phone: '+2348012345678' },
      });
    prisma.otpCode.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('rejects malformed idempotency keys before writing auth state', async () => {
    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: 'not-a-uuid',
      }),
    ).rejects.toThrow('Idempotency-Key must be a UUIDv4 value.');
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });
});
