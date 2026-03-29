import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService', () => {
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
    queue = new NotificationQueueService(prisma as never as PrismaService);
  });

  it('enqueues and claims otp job', async () => {
    prisma.notificationJob.create.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
      payloadJson: JSON.stringify({ phone: '+2348000000000', otp: '123456' }),
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

    await queue.enqueueOtpRequested({ phone: '+2348000000000', otp: '123456' });
    const job = await queue.claimReadyJob();

    expect(job).not.toBeNull();
    expect(job?.type).toBe('otp.requested');
    expect(job?.attempts).toBe(0);
    expect(prisma.notificationJob.create).toHaveBeenCalled();
  });

  it('moves job to dead letter status after max attempts', async () => {
    await queue.markFailed(
      {
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '+2348000000000', otp: '123456' },
        status: 'processing',
        attempts: 2,
        maxAttempts: 3,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      new Error('provider down'),
    );

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        attempts: 3,
        status: 'dead_letter',
        nextRunAt: expect.any(Date) as unknown as Date,
        failedAt: expect.any(Date) as unknown as Date,
        lastError: 'provider down',
        lockedAt: null,
      },
    });
  });
});
