import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService encrypted weekly and recovery claims', () => {
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

  it.each([
    {
      type: 'weekly.summary' as const,
      jobId: 'job_weekly',
      dedupeKey: 'weekly.summary:user_1:goal_1:2026-11-12',
      body: 'Stead weekly: Rent is 40% ready.',
    },
    {
      type: 'risk.recovery' as const,
      jobId: 'job_recovery',
      dedupeKey: 'risk.recovery:user_1:goal_1:stable',
      body: 'Rent has recovered to stable (score 72).',
    },
  ])(
    'decrypts an encrypted $type payload and keeps the persisted type',
    async ({ type, jobId, dedupeKey, body }) => {
      let payloadJson = '';
      prisma.notificationJob.create.mockImplementation(
        (input: { data: { payloadJson: string } }) => {
          payloadJson = input.data.payloadJson;
          return Promise.resolve({ id: jobId });
        },
      );

      await expect(
        queue.enqueueReadinessAlert({
          type,
          userId: 'user_1',
          goalId: 'goal_1',
          dedupeKey,
          payload: {
            phone: '+2348000000000',
            body,
          },
        }),
      ).resolves.toBe(true);

      expect(payloadJson).not.toContain('+2348000000000');
      expect(payloadJson).not.toContain(body);

      prisma.notificationJob.findFirst.mockResolvedValue({ id: jobId });
      prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
        id: jobId,
        type,
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
          id: jobId,
          type,
          payload: {
            phone: '+2348000000000',
            body,
          },
        }),
      );
      expect(prisma.notificationJob.update).not.toHaveBeenCalled();
    },
  );
});
