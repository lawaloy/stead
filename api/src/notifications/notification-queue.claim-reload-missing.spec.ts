import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim reload after lock', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('does not mark the job failed when the lock wins and the reload misses', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({
      id: 'job_1',
      status: 'pending',
    });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockRejectedValue(
      new Error('claim reload missing'),
    );

    await expect(queue.claimReadyJob()).rejects.toThrow('claim reload missing');

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        OR: [
          {
            status: 'pending',
            nextRunAt: { lte: expect.any(Date) as unknown },
          },
          {
            status: 'processing',
            OR: [
              { lockedAt: null },
              { lockedAt: { lte: expect.any(Date) as unknown } },
            ],
          },
        ],
      },
      data: {
        status: 'processing',
        lockedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.notificationJob.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'job_1' },
    });
    expect(prisma.notificationJob.update).not.toHaveBeenCalled();
  });
});
