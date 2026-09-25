import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService readiness payload shape edges', () => {
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
  let configGet: jest.Mock;

  const claimWithPayload = async (payloadJson: string) => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'weekly.summary',
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
    return queue.claimReadyJob();
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
    configGet = jest
      .fn()
      .mockReturnValue('test-notification-encryption-key-1234567890');
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: configGet,
      } as never,
    );
  });

  it('maps legacy plaintext readiness payloads without requiring an encryption key', async () => {
    configGet.mockReturnValue(undefined);

    const job = await claimWithPayload(
      JSON.stringify({
        phone: '+2348000000000',
        body: 'Stead weekly: Rent is 40% ready.',
      }),
    );

    expect(job).toEqual(
      expect.objectContaining({
        id: 'job_1',
        type: 'weekly.summary',
        payload: {
          phone: '+2348000000000',
          body: 'Stead weekly: Rent is 40% ready.',
        },
      }),
    );
    expect(configGet).not.toHaveBeenCalled();
  });
});
