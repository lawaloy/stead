import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService readiness enqueue errors', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  const alert = {
    type: 'risk.alert' as const,
    userId: 'user_1',
    goalId: 'goal_1',
    dedupeKey: 'risk:user_1:goal_1:drop',
    payload: { phone: '+2348000000000', body: 'Risk alert' },
  };
  let queue: NotificationQueueService;
  let prisma: { notificationJob: { create: jest.Mock } };

  beforeEach(() => {
    prisma = {
      notificationJob: { create: jest.fn() },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('swallows only unique-key collisions and rethrows other enqueue failures', async () => {
    prisma.notificationJob.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(queue.enqueueReadinessAlert(alert)).resolves.toBe(false);

    prisma.notificationJob.create.mockRejectedValueOnce({
      code: 'P1001',
    });
    await expect(queue.enqueueReadinessAlert(alert)).rejects.toMatchObject({
      code: 'P1001',
    });

    prisma.notificationJob.create.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(queue.enqueueReadinessAlert(alert)).rejects.toThrow(
      'database unavailable',
    );
  });
});
