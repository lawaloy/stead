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
      deleteMany: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let notificationPublisher: {
    publishOtpRequested: jest.Mock;
    isOtpRequestEnqueued: jest.Mock;
    adoptLegacyOtpRequest: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'otp_1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'user_1',
          phone: '+2348012345678',
        }),
      },
    };
    notificationPublisher = {
      publishOtpRequested: jest.fn(),
      isOtpRequestEnqueued: jest.fn().mockResolvedValue(false),
      adoptLegacyOtpRequest: jest.fn().mockResolvedValue(false),
    };

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
      id: 'otp_1',
      createdAt: new Date(),
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

  it('repairs an incomplete request when its notification job was enqueued', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_1',
      createdAt: new Date(Date.now() - 60_000),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.isOtpRequestEnqueued.mockResolvedValue(true);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: { requestCompletedAt: expect.any(Date) as Date },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('adopts a queued job from the previous release before stale cleanup', async () => {
    const createdAt = new Date(Date.now() - 60_000);
    const expiresAt = new Date(Date.now() + 9 * 60_000);
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_legacy',
      userId: 'user_1',
      createdAt,
      expiresAt,
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.adoptLegacyOtpRequest.mockResolvedValue(true);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(notificationPublisher.adoptLegacyOtpRequest).toHaveBeenCalledWith({
      userId: 'user_1',
      otpCodeId: 'otp_legacy',
      dedupeKey: expect.stringMatching(/^otp\.requested:/) as unknown,
      requestedAt: createdAt,
      expiresAt,
    });
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    expect(notificationPublisher.publishOtpRequested).not.toHaveBeenCalled();
  });

  it('restarts a stale incomplete request when no notification was enqueued', async () => {
    prisma.otpCode.findUnique.mockResolvedValueOnce({
      id: 'otp_stale',
      createdAt: new Date(Date.now() - 60_000),
      requestCompletedAt: null,
      developmentOtp: '111111',
      user: { phone: '+2348012345678' },
    });
    prisma.otpCode.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'otp_stale',
        requestCompletedAt: null,
        createdAt: { lte: expect.any(Date) as Date },
      },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
  });

  it('repairs a stale request when enqueue wins the cleanup race', async () => {
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_stale',
      createdAt: new Date(Date.now() - 60_000),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.isOtpRequestEnqueued
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    prisma.otpCode.deleteMany.mockRejectedValue({ code: 'P2003' });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_stale' },
      data: { requestCompletedAt: expect.any(Date) as Date },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('repairs completion after enqueue succeeds but the completion write fails', async () => {
    prisma.otpCode.update
      .mockRejectedValueOnce(new Error('completion write unavailable'))
      .mockResolvedValueOnce({ id: 'otp_1' });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toThrow('completion write unavailable');

    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp_1',
      createdAt: new Date(),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    notificationPublisher.isOtpRequestEnqueued.mockResolvedValue(true);

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ ok: true, otp: '123456' });
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.update).toHaveBeenCalledTimes(2);
  });

  it('restarts after a failed enqueue once the incomplete request is stale', async () => {
    notificationPublisher.publishOtpRequested.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toThrow('queue unavailable');

    prisma.otpCode.findUnique.mockResolvedValueOnce({
      id: 'otp_1',
      createdAt: new Date(Date.now() - 60_000),
      requestCompletedAt: null,
      developmentOtp: '123456',
      user: { phone: '+2348012345678' },
    });
    prisma.otpCode.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.requestOtp('08012345678', 'NG', {
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(notificationPublisher.publishOtpRequested).toHaveBeenCalledTimes(2);
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(2);
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
