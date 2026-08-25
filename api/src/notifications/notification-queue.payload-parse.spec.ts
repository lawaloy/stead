import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService corrupt payloadJson parsing', () => {
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

  it('fails closed when claim encounters non-JSON payloadJson', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_bad_json' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_bad_json',
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

    await expect(queue.claimReadyJob()).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_bad_json' },
        data: expect.objectContaining({
          attempts: 1,
          status: 'pending',
          lockedAt: null,
        }) as unknown,
      }),
    );
  });

  it('fails closed when listRecentJobs encounters non-JSON payloadJson', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_bad_json',
        type: 'otp.requested',
        payloadJson: '{broken',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        lockedAt: null,
        sentAt: null,
        failedAt: null,
        lastError: null,
        provider: null,
        providerMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(queue.listRecentJobs(1)).resolves.toEqual([
      expect.objectContaining({
        id: 'job_bad_json',
        payload: { phone: '<redacted>', redacted: true },
      }),
    ]);
  });
});
