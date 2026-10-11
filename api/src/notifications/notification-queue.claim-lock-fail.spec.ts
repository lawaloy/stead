import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim lock failure', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('does not treat a discovered job as claimed when the lock write fails', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({
      id: 'job_1',
      status: 'pending',
    });
    prisma.notificationJob.updateMany.mockRejectedValue(
      new Error('claim lock unavailable'),
    );

    await expect(queue.claimReadyJob()).rejects.toThrow(
      'claim lock unavailable',
    );

    expect(prisma.notificationJob.findFirst).toHaveBeenCalledTimes(1);
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
    expect(prisma.notificationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
