import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService undecryptable legacy deletion discovery', () => {
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

  it('omits undecryptable legacy jobs without aborting account deletion discovery', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      { id: 'linked_job', userId: 'user_1', payloadJson: '{}' },
      {
        id: 'legacy_corrupt',
        userId: null,
        payloadJson: '{"v":1,"iv":"bad","authTag":"bad","ciphertext":"bad"}',
      },
      { id: 'legacy_invalid_json', userId: null, payloadJson: 'not-json' },
    ]);

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).resolves.toEqual(['linked_job']);
    await expect(
      queue.canDeliver({
        id: 'linked_job',
        userId: 'user_1',
        payload: { phone: '+2348000000000', otp: '123456' },
      } as never),
    ).resolves.toBe(false);
    await expect(
      queue.canDeliver({
        id: 'legacy_corrupt',
        userId: null,
        payload: { phone: '+2348000000000', otp: '123456' },
      } as never),
    ).resolves.toBe(true);
    await expect(
      queue.canDeliver({
        id: 'legacy_invalid_json',
        userId: null,
        payload: { phone: '+2348000000000', otp: '123456' },
      } as never),
    ).resolves.toBe(true);
  });
});
