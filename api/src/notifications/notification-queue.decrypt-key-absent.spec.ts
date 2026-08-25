import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService decrypt without encryption key', () => {
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
  let configGet: jest.Mock;

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
    configGet = jest.fn().mockReturnValue(encryptionKey);
    queue = new NotificationQueueService(
      prisma as never,
      {
        get: configGet,
      } as never,
    );
  });

  it('fails closed when claiming an encrypted job after the encryption key is unset', async () => {
    const payloadJson = encryptWithKey(encryptionKey, {
      phone: '+2348000000000',
      otp: '123456',
    });
    configGet.mockReturnValue(undefined);

    await expect(claimWithPayload(payloadJson)).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Unable to decrypt notification payload',
        }) as unknown,
      }),
    );
  });

  it('fails closed when listing encrypted jobs after the encryption key is unset', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_encrypted',
        type: 'otp.requested',
        payloadJson: encryptWithKey(encryptionKey, {
          phone: '+2348000000000',
          otp: '123456',
        }),
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        lockedAt: null,
        sentAt: null,
        failedAt: null,
        lastError: null,
        provider: null,
        providerMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    configGet.mockReturnValue(undefined);

    await expect(queue.listRecentJobs(1)).resolves.toEqual([
      expect.objectContaining({
        id: 'job_encrypted',
        payload: { phone: '<redacted>', redacted: true },
      }),
    ]);
  });

  it('still maps redacted payloads when the encryption key is unset', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job_redacted',
        type: 'otp.requested',
        payloadJson: JSON.stringify({ redacted: true }),
        status: 'sent',
        attempts: 1,
        maxAttempts: 3,
        nextRunAt: new Date(),
        lockedAt: null,
        sentAt: new Date(),
        failedAt: null,
        lastError: null,
        provider: 'twilio',
        providerMessageId: 'SM1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    configGet.mockReturnValue(undefined);

    await expect(queue.listRecentJobs(1)).resolves.toEqual([
      expect.objectContaining({
        id: 'job_redacted',
        payload: { phone: '<redacted>', redacted: true },
      }),
    ]);
  });
});
