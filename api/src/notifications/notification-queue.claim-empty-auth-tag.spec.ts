import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService empty envelope authTag', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
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

  const encryptWithKey = (secret: string, payload: unknown) => {
    const key = createHash('sha256').update(secret, 'utf8').digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
  };

  const claimWithPayload = async (payloadJson: string) => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
      payloadJson,
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
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );
  });

  it('fails closed when a valid envelope has an empty-string authTag', async () => {
    const envelope = JSON.parse(
      encryptWithKey(encryptionKey, {
        phone: '+2348000000000',
        otp: '123456',
      }),
    ) as {
      v: number;
      iv: string;
      authTag: string;
      ciphertext: string;
    };
    envelope.authTag = '';

    await expect(
      claimWithPayload(JSON.stringify(envelope)),
    ).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Unable to decrypt notification payload',
          status: 'pending',
          lockedAt: null,
        }) as unknown,
      }),
    );
  });
});
