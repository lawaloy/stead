import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService empty vs whitespace OTP phones', () => {
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

  const claimOtpJob = async (payload: Record<string, string>) => {
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

  it('claims empty-string and whitespace-only phone destinations instead of failing closed', async () => {
    await expect(claimOtpJob({ phone: '', otp: '654321' })).resolves.toEqual(
      expect.objectContaining({
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '', otp: '654321' },
      }),
    );

    await expect(
      claimOtpJob({ phone: ' \t\n ', otp: '654321' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: ' \t\n ', otp: '654321' },
      }),
    );

    expect(prisma.notificationJob.update).not.toHaveBeenCalled();
  });
});
