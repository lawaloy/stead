import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService userId block during deletion discovery', () => {
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

  it('blocks a userId-linked job with a different phone while deletion is still discovering', async () => {
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
        id: 'linked_other_phone',
        userId: 'user_1',
        payload: { phone: '+2348111111111', otp: '123456' },
      } as never),
    ).resolves.toBe(false);
    expect(prisma.notificationJob.findUnique).not.toHaveBeenCalled();

    await expect(
      queue.canDeliver({
        id: 'other_user_job',
        userId: 'user_2',
        payload: { phone: '+2348222222222', otp: '654321' },
      } as never),
    ).resolves.toBe(true);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'other_user_job' },
      select: { id: true },
    });

    finishDiscovery?.([]);
    await deletion;
  });
});
