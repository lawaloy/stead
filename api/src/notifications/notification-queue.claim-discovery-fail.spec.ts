import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim discovery failure', () => {
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

  it('does not lock a job when ready-queue discovery fails', async () => {
    prisma.notificationJob.findFirst.mockRejectedValue(
      new Error('claim discovery unavailable'),
    );

    await expect(queue.claimReadyJob()).rejects.toThrow(
      'claim discovery unavailable',
    );

    expect(prisma.notificationJob.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.notificationJob.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
