import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService legacy deletion phone isolation', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'persisted_job' }),
      },
    };
    queue = new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('excludes legacy queued jobs whose decrypted phone does not match the deleting account', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'linked_job',
        userId: 'user_1',
        payloadJson: JSON.stringify({
          phone: '+2348000000000',
          otp: '111111',
        }),
      },
      {
        id: 'legacy_match',
        userId: null,
        payloadJson: JSON.stringify({
          phone: '+2348000000000',
          otp: '222222',
        }),
      },
      {
        id: 'legacy_other_phone',
        userId: null,
        payloadJson: JSON.stringify({
          phone: '+2348111111111',
          otp: '333333',
        }),
      },
    ]);

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).resolves.toEqual(['linked_job', 'legacy_match']);

    await expect(
      queue.canDeliver({
        id: 'legacy_match',
        userId: null,
        payload: { phone: '+2348000000000', otp: '222222' },
      } as never),
    ).resolves.toBe(false);
    await expect(
      queue.canDeliver({
        id: 'legacy_other_phone',
        userId: null,
        payload: { phone: '+2348111111111', otp: '333333' },
      } as never),
    ).resolves.toBe(true);
  });
});
