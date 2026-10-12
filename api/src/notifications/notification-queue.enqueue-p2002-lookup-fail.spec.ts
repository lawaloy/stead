import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP enqueue P2002 winner lookup failure', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';

  it('rethrows a dedupe lookup failure instead of treating the collision as a missing winner', async () => {
    const lookupFail = new Error('otp enqueue winner lookup unavailable');
    const prisma = {
      notificationJob: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockRejectedValue(lookupFail),
      },
    };
    const queue = new NotificationQueueService(
      prisma as never,
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
    ).rejects.toBe(lookupFail);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: 'otp.requested:key-hash' },
      select: { id: true, type: true, otpCodeId: true },
    });
  });
});
