import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim-before-decrypt ordering', () => {
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

  it('locks the job to processing then retries the claim when decrypt fails before max attempts', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_poison' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_poison',
      type: 'otp.requested',
      payloadJson: JSON.stringify({ note: 'not-an-otp-payload' }),
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

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job_poison' }) as unknown,
        data: {
          status: 'processing',
          lockedAt: expect.any(Date) as unknown,
        },
      }),
    );
    expect(prisma.notificationJob.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'job_poison' },
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_poison' },
        data: expect.objectContaining({
          attempts: 1,
          status: 'pending',
          lastError: 'Invalid notification payload',
          lockedAt: null,
        }) as unknown,
      }),
    );
  });

  it('dead-letters a poison claim on the last decrypt attempt', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_poison' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_poison',
      type: 'otp.requested',
      payloadJson: JSON.stringify({ note: 'not-an-otp-payload' }),
      status: 'processing',
      attempts: 2,
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
        where: { id: 'job_poison' },
        data: expect.objectContaining({
          attempts: 3,
          status: 'dead_letter',
          payloadJson: JSON.stringify({ redacted: true }),
          lastError: 'Invalid notification payload',
          lockedAt: null,
          failureAttempts: {
            create: expect.objectContaining({
              attemptNumber: 3,
              terminal: true,
            }) as unknown,
          },
        }) as unknown,
      }),
    );
  });
});
