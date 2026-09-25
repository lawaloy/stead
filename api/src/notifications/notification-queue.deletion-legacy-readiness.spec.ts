import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService legacy readiness deletion isolation', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationJob: {
        create: jest.fn(),
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

  it('blocks encrypted and plaintext readiness jobs for the deleting phone only', async () => {
    let encryptedReadiness = '';
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        encryptedReadiness = input.data.payloadJson;
        return Promise.resolve({ id: 'legacy_encrypted_readiness' });
      },
    );

    await expect(
      queue.enqueueReadinessAlert({
        type: 'weekly.summary',
        userId: 'user_1',
        goalId: 'goal_1',
        dedupeKey: 'weekly:user_1:goal_1:2026-09-06',
        payload: {
          phone: '+2348000000000',
          body: 'Stead weekly: Rent is 40% ready.',
        },
      }),
    ).resolves.toBe(true);
    expect(encryptedReadiness).not.toContain('+2348000000000');
    expect(encryptedReadiness).not.toContain('Stead weekly');

    prisma.notificationJob.findMany.mockResolvedValue([
      { id: 'linked_job', userId: 'user_1', payloadJson: '{}' },
      {
        id: 'legacy_encrypted_readiness',
        userId: null,
        payloadJson: encryptedReadiness,
      },
      {
        id: 'legacy_plaintext_match',
        userId: null,
        payloadJson: JSON.stringify({
          phone: '+2348000000000',
          body: 'Stead alert: Rent moved to warning.',
        }),
      },
      {
        id: 'legacy_plaintext_other_phone',
        userId: null,
        payloadJson: JSON.stringify({
          phone: '+2348111111111',
          body: 'Stead weekly: Other rent is 10% ready.',
        }),
      },
    ]);

    await expect(
      queue.beginAccountDeletion('user_1', '+2348000000000'),
    ).resolves.toEqual([
      'linked_job',
      'legacy_encrypted_readiness',
      'legacy_plaintext_match',
    ]);

    await expect(
      queue.canDeliver({
        id: 'legacy_encrypted_readiness',
        userId: null,
        payload: {
          phone: '+2348000000000',
          body: 'Stead weekly: Rent is 40% ready.',
        },
      } as never),
    ).resolves.toBe(false);
    await expect(
      queue.canDeliver({
        id: 'legacy_plaintext_match',
        userId: null,
        payload: {
          phone: '+2348000000000',
          body: 'Stead alert: Rent moved to warning.',
        },
      } as never),
    ).resolves.toBe(false);
    await expect(
      queue.canDeliver({
        id: 'legacy_plaintext_other_phone',
        userId: null,
        payload: {
          phone: '+2348111111111',
          body: 'Stead weekly: Other rent is 10% ready.',
        },
      } as never),
    ).resolves.toBe(true);
  });
});
