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

  it('marks succeeded jobs as sent and clears failure fields', async () => {
    await queue.markSucceeded('job_1', {
      provider: 'twilio',
      providerMessageId: 'SM123',
    });

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        status: 'sent',
        sentAt: expect.any(Date) as unknown,
        provider: 'twilio',
        providerMessageId: 'SM123',
        lastError: null,
        failedAt: null,
        lockedAt: null,
      },
    });
  });

  it('stores a fallback error message for non-Error failures', async () => {
    await queue.markFailed(
      {
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '+2348000000000', otp: '123456' },
        status: 'processing',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'string failure',
    );

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: expect.objectContaining({
        attempts: 1,
        status: 'pending',
        lastError: 'Unknown notification error',
        lockedAt: null,
      }) as unknown,
    });
  });

  it('caps retry backoff at 30 seconds', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    await queue.markFailed(
      {
        id: 'job_1',
        type: 'otp.requested',
        payload: { phone: '+2348000000000', otp: '123456' },
        status: 'processing',
        attempts: 4,
        maxAttempts: 10,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      },
      new Error('provider down'),
    );

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: expect.objectContaining({
        attempts: 5,
        status: 'pending',
        nextRunAt: new Date('2026-01-01T00:00:30.000Z'),
      }) as unknown,
    });
  });

  it('counts pending and processing jobs for queue depth', async () => {
    prisma.notificationJob.count.mockResolvedValue(7);

    await expect(queue.getQueueDepth()).resolves.toBe(7);
    expect(prisma.notificationJob.count).toHaveBeenCalledWith({
      where: { status: { in: ['pending', 'processing'] } },
    });
  });

  it('counts dead-letter jobs separately', async () => {
    prisma.notificationJob.count.mockResolvedValue(2);

    await expect(queue.getDeadLetterDepth()).resolves.toBe(2);
    expect(prisma.notificationJob.count).toHaveBeenCalledWith({
      where: { status: 'dead_letter' },
    });
  });

  it('maps groupBy rows into a status summary', async () => {
    prisma.notificationJob.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 3 } },
      { status: 'dead_letter', _count: { _all: 1 } },
    ]);

    await expect(queue.getStatusSummary()).resolves.toEqual({
      pending: 3,
      dead_letter: 1,
    });
  });

  it('lists recent jobs newest-first and maps payloads', async () => {
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_2',
        type: 'otp.requested',
        payloadJson: JSON.stringify({ phone: '+2348000000001', otp: '654321' }),
        status: 'sent',
        attempts: 1,
        maxAttempts: 3,
        nextRunAt: updatedAt,
        lockedAt: null,
        sentAt: updatedAt,
        failedAt: null,
        lastError: null,
        provider: 'termii',
        providerMessageId: 'termii-1',
        createdAt: updatedAt,
        updatedAt,
      },
    ]);

    const jobs = await queue.listRecentJobs(5);

    expect(prisma.notificationJob.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'job_2',
        type: 'otp.requested',
        payload: { phone: '+2348000000001', otp: '654321' },
        status: 'sent',
        provider: 'termii',
        providerMessageId: 'termii-1',
      }),
    ]);
  });

  it('coerces persisted non-otp job types to otp.requested when mapping', async () => {
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_3',
        type: 'other.event',
        payloadJson: JSON.stringify({ phone: '+2348000000002', otp: '111222' }),
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: updatedAt,
        lockedAt: null,
        sentAt: null,
        failedAt: null,
        lastError: null,
        provider: null,
        providerMessageId: null,
        createdAt: updatedAt,
        updatedAt,
      },
    ]);

    const jobs = await queue.listRecentJobs();

    expect(prisma.notificationJob.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'job_3',
        type: 'otp.requested',
        payload: { phone: '+2348000000002', otp: '111222' },
      }),
    ]);
  });

  it('omits empty provider metadata when marking a job succeeded', async () => {
    await queue.markSucceeded('job_1', {
      provider: '',
      providerMessageId: '',
    });

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        status: 'sent',
        sentAt: expect.any(Date) as unknown,
        provider: undefined,
        providerMessageId: undefined,
        lastError: null,
        failedAt: null,
        lockedAt: null,
      },
    });
  });
});
