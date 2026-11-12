import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService primitive payloadJson', () => {
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

  const claimWithPayload = async (payloadJson: string) => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
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
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest
          .fn()
          .mockReturnValue('test-notification-encryption-key-1234567890'),
      } as never,
    );
  });

  it.each([
    ['number', '1'],
    ['boolean', 'true'],
    ['string', '"otp.requested"'],
  ] as const)(
    'fails closed when a claimed payload is a JSON %s instead of an object',
    async (_kind, payloadJson) => {
      await expect(claimWithPayload(payloadJson)).resolves.toBeNull();

      expect(prisma.notificationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_1' },
          data: expect.objectContaining({
            lastError: 'Invalid notification payload',
            status: 'pending',
            lockedAt: null,
          }) as unknown,
        }),
      );
    },
  );
});
