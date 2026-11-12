import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService encrypted readiness claim', () => {
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

  it('decrypts an encrypted risk.alert payload and keeps the persisted type', async () => {
    let payloadJson = '';
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        payloadJson = input.data.payloadJson;
        return Promise.resolve({ id: 'job_alert' });
      },
    );

    await expect(
      queue.enqueueReadinessAlert({
        type: 'risk.alert',
        userId: 'user_1',
        goalId: 'goal_1',
        dedupeKey: 'risk.alert:user_1:goal_1:critical',
        payload: {
          phone: '+2348000000000',
          body: 'Rent is behind. Top up this week.',
        },
      }),
    ).resolves.toBe(true);

    expect(payloadJson).not.toContain('+2348000000000');
    expect(payloadJson).not.toContain('Rent is behind');

    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_alert' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_alert',
      type: 'risk.alert',
      payloadJson,
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

    await expect(queue.claimReadyJob()).resolves.toEqual(
      expect.objectContaining({
        id: 'job_alert',
        type: 'risk.alert',
        payload: {
          phone: '+2348000000000',
          body: 'Rent is behind. Top up this week.',
        },
      }),
    );
    expect(prisma.notificationJob.update).not.toHaveBeenCalled();
  });
});
