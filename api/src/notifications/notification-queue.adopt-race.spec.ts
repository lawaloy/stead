import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP adoption races', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const input = {
    userId: 'user_1',
    otpCodeId: 'otp_1',
    dedupeKey: 'otp.requested:key-hash',
    requestedAt: new Date('2026-09-28T10:00:00Z'),
    expiresAt: new Date('2026-09-28T10:10:00Z'),
  };
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('returns false when no unmatched legacy OTP job exists', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue(null);

    await expect(queue.adoptLegacyOtpRequest(input)).resolves.toBe(false);
    expect(prisma.notificationJob.updateMany).not.toHaveBeenCalled();
  });

  it('falls back to the dedupe lookup when the adoption update matches no row', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'legacy_job' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificationJob.findUnique.mockResolvedValue({
      type: 'otp.requested',
      otpCodeId: 'otp_1',
    });

    await expect(queue.adoptLegacyOtpRequest(input)).resolves.toBe(true);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: input.dedupeKey },
      select: { type: true, otpCodeId: true },
    });
  });

  it('treats a P2002 adoption collision as success only when the matching OTP is already linked', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'legacy_job' });
    prisma.notificationJob.updateMany.mockRejectedValue({ code: 'P2002' });
    prisma.notificationJob.findUnique.mockResolvedValue({
      type: 'otp.requested',
      otpCodeId: 'otp_other',
    });

    await expect(queue.adoptLegacyOtpRequest(input)).resolves.toBe(false);
  });

  it('rethrows non-P2002 adoption write failures', async () => {
    const failure = new Error('adoption write unavailable');
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'legacy_job' });
    prisma.notificationJob.updateMany.mockRejectedValue(failure);

    await expect(queue.adoptLegacyOtpRequest(input)).rejects.toBe(failure);
    expect(prisma.notificationJob.findUnique).not.toHaveBeenCalled();
  });

  it('does not treat a mismatched type or OTP id as an enqueued request', async () => {
    prisma.notificationJob.findUnique
      .mockResolvedValueOnce({
        type: 'readiness.alert',
        otpCodeId: 'otp_1',
      })
      .mockResolvedValueOnce({
        type: 'otp.requested',
        otpCodeId: 'otp_other',
      });

    await expect(
      queue.isOtpRequestEnqueued(input.dedupeKey, 'otp_1'),
    ).resolves.toBe(false);
    await expect(
      queue.isOtpRequestEnqueued(input.dedupeKey, 'otp_1'),
    ).resolves.toBe(false);
  });
});
