import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService phone block during deletion discovery', () => {
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
        findUnique: jest.fn().mockResolvedValue({ id: 'persisted_job' }),
      },
    };
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('blocks a different userId job that shares the phone while deletion is still discovering', async () => {
    let finishDiscovery: ((jobs: never[]) => void) | undefined;
    prisma.notificationJob.findMany.mockImplementation(
      () =>
        new Promise<never[]>((resolve) => {
          finishDiscovery = resolve;
        }),
    );

    const deletion = queue.beginAccountDeletion('user_1', '+2348000000000');

    await expect(
      queue.canDeliver({
        id: 'other_user_same_phone',
        userId: 'user_2',
        payload: { phone: '+2348000000000', otp: '654321' },
      } as never),
    ).resolves.toBe(false);
    expect(prisma.notificationJob.findUnique).not.toHaveBeenCalled();

    await expect(
      queue.canDeliver({
        id: 'other_user_other_phone',
        userId: 'user_2',
        payload: { phone: '+2348222222222', otp: '654321' },
      } as never),
    ).resolves.toBe(true);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'other_user_other_phone' },
      select: { id: true },
    });

    finishDiscovery?.([]);
    await deletion;
  });
});
