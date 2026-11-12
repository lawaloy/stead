import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService claim OTP type with readiness payloads', () => {
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

  const claimLocked = async (payload: Record<string, string>) => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
      payloadJson: JSON.stringify(payload),
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
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest
          .fn()
          .mockReturnValue('test-notification-encryption-key-1234567890'),
      } as never,
    );
  });

  it('keeps a persisted otp.requested type even when the payload is a readiness body', async () => {
    const job = await claimLocked({
      phone: '+2348000000000',
      body: 'Rent is behind.',
    });

    expect(job).toEqual(
      expect.objectContaining({
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '+2348000000000', body: 'Rent is behind.' },
      }),
    );
    expect(prisma.notificationJob.update).not.toHaveBeenCalled();
  });
});
