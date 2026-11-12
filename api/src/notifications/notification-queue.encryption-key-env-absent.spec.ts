import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService encryption key ignores process.env', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';
  let queue: NotificationQueueService;
  let prisma: {
    notificationJob: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
  };
  let previousEncryptionKey: string | undefined;

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

  beforeEach(() => {
    previousEncryptionKey = process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY;
    process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY = encryptionKey;
    prisma = {
      notificationJob: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as never,
    );
  });

  afterEach(() => {
    if (previousEncryptionKey === undefined) {
      delete process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY;
    } else {
      process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY = previousEncryptionKey;
    }
  });

  it('fails closed at enqueue when ConfigService omits the key even if process.env is set', async () => {
    await expect(
      queue.enqueueOtpRequested(
        {
          phone: '+2348000000000',
          otp: '123456',
        },
        undefined,
        'otp_1',
        'otp.requested:env-key-absent',
      ),
    ).rejects.toThrow('Notification payload encryption key is not configured');
    expect(prisma.notificationJob.create).not.toHaveBeenCalled();
  });

  it('does not decrypt a claimed job using process.env when ConfigService omits the key', async () => {
    prisma.notificationJob.findFirst.mockResolvedValue({ id: 'job_1' });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_1',
      type: 'otp.requested',
      payloadJson: encryptWithKey(encryptionKey, {
        phone: '+2348000000000',
        otp: '123456',
      }),
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

    await expect(queue.claimReadyJob()).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Unable to decrypt notification payload',
        }) as unknown,
      }),
    );
  });
});
