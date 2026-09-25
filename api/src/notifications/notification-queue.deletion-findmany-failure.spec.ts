import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService deletion discovery failure', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'legacy_job' }),
      },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('unblocks the discovered phone when job lookup fails', async () => {
    prisma.notificationJob.findMany.mockRejectedValue(
      new Error('discovery unavailable'),
    );

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).rejects.toThrow('discovery unavailable');

    await expect(
      queue.canDeliver({
        id: 'legacy_job',
        userId: null,
        payload: { phone: '+2348000000000', otp: '123456' },
      } as never),
    ).resolves.toBe(true);
  });
});
