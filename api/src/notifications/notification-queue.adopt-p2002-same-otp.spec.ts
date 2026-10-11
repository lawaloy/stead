import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP adoption P2002 same-OTP success', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const input = {
    userId: 'user_1',
    otpCodeId: 'otp_1',
    dedupeKey: 'otp.requested:key-hash',
    requestedAt: new Date('2026-09-28T10:00:00Z'),
    expiresAt: new Date('2026-09-28T10:10:00Z'),
  };

  it('treats a P2002 collision as success when the dedupe row already links this OTP', async () => {
    const prisma = {
      notificationJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'legacy_job' }),
        updateMany: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({
          type: 'otp.requested',
          otpCodeId: 'otp_1',
        }),
      },
    };
    const queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );

    await expect(queue.adoptLegacyOtpRequest(input)).resolves.toBe(true);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: input.dedupeKey },
      select: { type: true, otpCodeId: true },
    });
  });
});
