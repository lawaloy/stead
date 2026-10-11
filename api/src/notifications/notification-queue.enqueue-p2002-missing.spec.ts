import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP enqueue P2002 missing winner', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';

  it('rethrows a dedupe collision when the winning job is no longer readable', async () => {
    const collision = { code: 'P2002' };
    const prisma = {
      notificationJob: {
        create: jest.fn().mockRejectedValue(collision),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );

    await expect(
      queue.enqueueOtpRequested(
        { phone: '+2348000000000', otp: '123456' },
        'user_1',
        'otp_1',
        'otp.requested:key-hash',
      ),
    ).rejects.toBe(collision);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: 'otp.requested:key-hash' },
      select: { id: true, type: true, otpCodeId: true },
    });
  });
});
