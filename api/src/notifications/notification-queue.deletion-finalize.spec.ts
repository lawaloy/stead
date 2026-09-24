import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService account-deletion finalize + mid-flight deletes', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const JOB_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const linkedJob = {
    id: 'linked_job',
    userId: 'user_1',
    payload: { phone: '+2348000000000', otp: '123456' },
  } as never;

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'persisted_job' }),
        update: jest.fn(),
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

  it('clears the discovery block when listing deletion candidates fails', async () => {
    prisma.notificationJob.findMany.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).rejects.toThrow('database unavailable');
    await expect(
      queue.canDeliver({
        id: 'legacy_job',
        userId: null,
        payload: { phone: '+2348000000000', otp: '123456' },
      } as never),
    ).resolves.toBe(true);
  });

  it('keeps delivery blocked after finalize until the lock timeout elapses', async () => {
    jest.useFakeTimers();
    prisma.notificationJob.findMany.mockResolvedValue([
      { id: 'linked_job', userId: 'user_1', payloadJson: '{}' },
    ]);

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).resolves.toEqual(['linked_job']);
    await expect(queue.canDeliver(linkedJob)).resolves.toBe(false);

    queue.finalizeAccountDeletion('user_1');

    await expect(queue.canDeliver(linkedJob)).resolves.toBe(false);
    jest.advanceTimersByTime(JOB_LOCK_TIMEOUT_MS - 1);
    await expect(queue.canDeliver(linkedJob)).resolves.toBe(false);

    jest.advanceTimersByTime(1);
    await expect(queue.canDeliver(linkedJob)).resolves.toBe(true);
  });

  it('swallows P2025 when a claimed job row was deleted mid-flight', async () => {
    prisma.notificationJob.update.mockRejectedValue({ code: 'P2025' });

    await expect(
      queue.markSucceeded({ id: 'job_1' } as never),
    ).resolves.toBeUndefined();
    await expect(
      queue.markFailed(
        {
          id: 'job_1',
          attempts: 0,
          maxAttempts: 3,
          nextRunAt: new Date(),
        } as never,
        new Error('provider down'),
      ),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-missing update errors from markSucceeded and markFailed', async () => {
    const collision = { code: 'P2002' };
    prisma.notificationJob.update.mockRejectedValue(collision);

    await expect(queue.markSucceeded({ id: 'job_1' } as never)).rejects.toEqual(
      collision,
    );
    await expect(
      queue.markFailed(
        {
          id: 'job_1',
          attempts: 0,
          maxAttempts: 3,
          nextRunAt: new Date(),
        } as never,
        new Error('provider down'),
      ),
    ).rejects.toEqual(collision);
  });
});
