import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const redactedPayloadJson = JSON.stringify({ redacted: true });
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
    notificationFailureAttempt: {
      count: jest.Mock;
      findFirst: jest.Mock;
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
      notificationFailureAttempt: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues and claims otp job', async () => {
    let encryptedPayloadJson = '';
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        encryptedPayloadJson = input.data.payloadJson;
        return Promise.resolve({ id: 'job_1' });
      },
    );
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    await queue.enqueueOtpRequested({
      phone: '+2348000000000',
      otp: '123456',
    });
    expect(encryptedPayloadJson).not.toContain('+2348000000000');
    expect(encryptedPayloadJson).not.toContain('123456');

    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
      payloadJson: encryptedPayloadJson,
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

    const job = await queue.claimReadyJob();

    expect(job).not.toBeNull();
    expect(job?.type).toBe('otp.requested');
    expect(job?.attempts).toBe(0);
    expect(job?.payload).toEqual({
      phone: '+2348000000000',
      otp: '123456',
    });
    expect(prisma.notificationJob.create).toHaveBeenCalled();
  });

  it('returns null when another worker claims the candidate first', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(queue.claimReadyJob()).resolves.toBeNull();

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        OR: [
          {
            status: 'pending',
            nextRunAt: { lte: expect.any(Date) as unknown },
          },
          {
            status: 'processing',
            OR: [
              { lockedAt: null },
              { lockedAt: { lte: expect.any(Date) as unknown } },
            ],
          },
        ],
      },
      data: {
        status: 'processing',
        lockedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.notificationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('reclaims processing jobs after the lock lease expires', async () => {
    const now = new Date('2026-01-01T00:10:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_stale' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_stale',
      type: 'otp.requested',
      payloadJson: JSON.stringify({ phone: '+2348000000000', otp: '123456' }),
      status: 'processing',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      lockedAt: now,
      sentAt: null,
      failedAt: null,
      lastError: null,
      provider: null,
      providerMessageId: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(queue.claimReadyJob()).resolves.toEqual(
      expect.objectContaining({ id: 'job_stale' }),
    );
    expect(prisma.notificationJob.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: 'pending', nextRunAt: { lte: now } },
          {
            status: 'processing',
            OR: [
              { lockedAt: null },
              {
                lockedAt: {
                  lte: new Date('2026-01-01T00:05:00.000Z'),
                },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
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
        payloadJson: undefined,
        attempts: 1,
        status: 'pending',
        nextRunAt: new Date('2026-01-01T00:00:02.000Z'),
        failedAt: now,
        lastError: 'provider down',
        lockedAt: null,
        failureAttempts: {
          create: {
            attemptNumber: 1,
            terminal: false,
            failedAt: now,
          },
        },
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
        payloadJson: redactedPayloadJson,
        attempts: 3,
        status: 'dead_letter',
        nextRunAt: expect.any(Date) as unknown,
        failedAt: expect.any(Date) as unknown,
        lastError: 'provider down',
        lockedAt: null,
        failureAttempts: {
          create: {
            attemptNumber: 3,
            terminal: true,
            failedAt: expect.any(Date) as unknown,
          },
        },
      },
    });
  });

  it('marks succeeded jobs as sent and clears failure fields', async () => {
    await queue.markSucceeded({ id: 'job_1' } as never, {
      provider: 'twilio',
      providerMessageId: 'SM123',
    });

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        payloadJson: redactedPayloadJson,
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

  it('reports retry, stale-lock, and recent failure diagnostics', async () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    prisma.notificationJob.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.notificationFailureAttempt.count.mockResolvedValue(4);
    prisma.notificationJob.findFirst.mockResolvedValue({
      id: 'job_pending',
      nextRunAt: new Date('2026-08-05T11:55:00.000Z'),
      attempts: 1,
    });
    prisma.notificationFailureAttempt.findFirst.mockResolvedValue({
      notificationJobId: 'job_failed',
      failedAt: new Date('2026-08-05T11:59:00.000Z'),
      notificationJob: {
        status: 'sent',
        lastError: null,
      },
    });

    await expect(queue.getOperationalHealth(now)).resolves.toEqual({
      generatedAt: now,
      retrying: 2,
      staleProcessing: 1,
      attemptFailuresLast24Hours: 4,
      deadLettersLast24Hours: 1,
      oldestPending: {
        id: 'job_pending',
        nextRunAt: new Date('2026-08-05T11:55:00.000Z'),
        attempts: 1,
      },
      lastFailure: {
        id: 'job_failed',
        status: 'sent',
        failedAt: new Date('2026-08-05T11:59:00.000Z'),
        lastError: null,
      },
    });
    expect(prisma.notificationJob.count.mock.calls).toEqual([
      [{ where: { status: 'pending', attempts: { gt: 0 } } }],
      [
        {
          where: {
            status: 'processing',
            OR: [
              { lockedAt: null },
              { lockedAt: { lte: new Date('2026-08-05T11:55:00.000Z') } },
            ],
          },
        },
      ],
      [
        {
          where: {
            status: 'dead_letter',
            failedAt: { gte: new Date('2026-08-04T12:00:00.000Z') },
          },
        },
      ],
    ]);
    expect(prisma.notificationFailureAttempt.count).toHaveBeenCalledWith({
      where: {
        failedAt: { gte: new Date('2026-08-04T12:00:00.000Z') },
      },
    });
    expect(prisma.notificationFailureAttempt.findFirst).toHaveBeenCalledWith({
      orderBy: { failedAt: 'desc' },
      select: {
        notificationJobId: true,
        failedAt: true,
        notificationJob: { select: { status: true, lastError: true } },
      },
    });
  });

  it('lists recent jobs newest-first and maps payloads', async () => {
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_2',
        type: 'otp.requested',
        payloadJson: redactedPayloadJson,
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
        payload: { phone: '<redacted>', redacted: true },
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
    await queue.markSucceeded({ id: 'job_1' } as never, {
      provider: '',
      providerMessageId: '',
    });

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: {
        payloadJson: redactedPayloadJson,
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

  it('redacts legacy payloads from terminal jobs', async () => {
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 2 });

    await queue.redactTerminalPayloads();

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['sent', 'dead_letter'] },
        NOT: { payloadJson: redactedPayloadJson },
      },
      data: { payloadJson: redactedPayloadJson },
    });
  });
});
