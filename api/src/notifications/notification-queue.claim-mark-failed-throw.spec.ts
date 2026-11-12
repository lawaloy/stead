import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim markFailed persistence failure', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('surfaces markFailed errors after locking an unreadable job so the processing lock is not silently kept', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_poison' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_poison',
      type: 'otp.requested',
      payloadJson: 'not-json{',
      status: 'processing',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date(),
      lockedAt: new Date(),
      sentAt: null,
      failedAt: null,
      lastError: null,
      provider: null,
      providerMessageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.notificationJob.update.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(queue.claimReadyJob()).rejects.toThrow('db unavailable');

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job_poison' }) as unknown,
        data: {
          status: 'processing',
          lockedAt: expect.any(Date) as unknown,
        },
      }),
    );
    expect(prisma.notificationJob.update).toHaveBeenCalledTimes(1);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_poison' },
        data: expect.objectContaining({
          attempts: 1,
          status: 'pending',
          lockedAt: null,
        }) as unknown,
      }),
    );
  });
});
