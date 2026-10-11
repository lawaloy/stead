import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP enqueue errors', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: { notificationJob: { create: jest.Mock; findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = {
      notificationJob: { create: jest.fn(), findUnique: jest.fn() },
    };
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('does not reuse a missing winner when OTP enqueue fails for a non-collision reason', async () => {
    prisma.notificationJob.create.mockRejectedValueOnce({
      code: 'P1001',
    });
    await expect(
      queue.enqueueOtpRequested(
        { phone: '+2348000000000', otp: '123456' },
        'user_1',
        'otp_1',
        'otp.requested:key-hash',
      ),
    ).rejects.toMatchObject({
      code: 'P1001',
    });

    prisma.notificationJob.create.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      queue.enqueueOtpRequested(
        { phone: '+2348000000000', otp: '123456' },
        'user_1',
        'otp_1',
        'otp.requested:key-hash',
      ),
    ).rejects.toThrow('database unavailable');

    expect(prisma.notificationJob.findUnique).not.toHaveBeenCalled();
  });
});
