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

  afterEach(() => {
    jest.useRealTimers();
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

  it('returns null when another worker claims the candidate first', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(queue.claimReadyJob()).resolves.toBeNull();

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        status: 'pending',
      },
      data: {
        status: 'processing',
        lockedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.notificationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('returns null without claiming when the queue has no ready jobs', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue(null);

    await expect(queue.claimReadyJob()).resolves.toBeNull();

    expect(prisma.notificationJob.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('reschedules non-terminal failures with retry backoff', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    await queue.markFailed(
      {
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '+2348000000000', otp: '123456' },
        status: 'processing',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
      },
      new Error('provider down'),
    );

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        attempts: 1,
        status: 'pending',
        nextRunAt: new Date('2026-01-01T00:00:02.000Z'),
        failedAt: now,
        lastError: 'provider down',
        lockedAt: null,
      },
    });
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
        nextRunAt: expect.any(Date) as unknown,
        failedAt: expect.any(Date) as unknown,
        lastError: 'provider down',
        lockedAt: null,
      },
    });
  });
});
