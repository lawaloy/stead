import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP adoption fallback lookup failure', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const input = {
    userId: 'user_1',
    otpCodeId: 'otp_1',
    dedupeKey: 'otp.requested:key-hash',
    requestedAt: new Date('2026-09-28T10:00:00Z'),
    expiresAt: new Date('2026-09-28T10:10:00Z'),
  };

  it('rethrows a post-race dedupe lookup failure instead of treating it as not enqueued', async () => {
    const failure = new Error('otp dedupe lookup unavailable');
    const prisma = {
      notificationJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'legacy_job' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockRejectedValue(failure),
      },
    };
    const queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );

    await expect(queue.adoptLegacyOtpRequest(input)).rejects.toBe(failure);
    expect(prisma.notificationJob.findFirst).toHaveBeenCalledWith({
      where: {
        type: 'otp.requested',
        userId: input.userId,
        otpCodeId: null,
        dedupeKey: null,
        createdAt: {
          gte: input.requestedAt,
          lte: input.expiresAt,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'legacy_job',
        type: 'otp.requested',
        userId: input.userId,
        otpCodeId: null,
        dedupeKey: null,
      },
      data: {
        otpCodeId: input.otpCodeId,
        dedupeKey: input.dedupeKey,
      },
    });
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: input.dedupeKey },
      select: { type: true, otpCodeId: true },
    });
  });
});
