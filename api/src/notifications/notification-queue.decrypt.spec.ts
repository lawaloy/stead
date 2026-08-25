import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService decrypt fail-closed paths', () => {
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
      prisma as never as PrismaService,
      { get: configGet } as never,
    );
  });

  it('rejects opaque payloads that are neither OTP nor encrypted envelopes', async () => {
    await expect(
      claimWithPayload(JSON.stringify({ note: 'not-an-otp-payload' })),
    ).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Invalid notification payload',
        }) as unknown,
      }),
    );
  });

  it('rejects encrypted envelopes produced with a different key', async () => {
    const payloadJson = encryptWithKey(
      'a-different-encryption-key-abcdefghij',
      {
        phone: '+2348000000000',
        otp: '123456',
      },
    );

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

  it('rejects tampered ciphertext inside an otherwise valid envelope', async () => {
    const envelope = JSON.parse(
      encryptWithKey(encryptionKey, {
        phone: '+2348000000000',
        otp: '123456',
      }),
    ) as { v: number; iv: string; authTag: string; ciphertext: string };
    envelope.ciphertext = Buffer.from('tampered-ciphertext').toString('base64');

    await expect(
      claimWithPayload(JSON.stringify(envelope)),
    ).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Unable to decrypt notification payload',
        }) as unknown,
      }),
    );
  });

  it('rejects encrypted envelopes whose plaintext is not an OTP payload', async () => {
    const payloadJson = encryptWithKey(encryptionKey, {
      phone: '+2348000000000',
    });

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

  it('rejects envelopes with an unsupported version', async () => {
    const envelope = JSON.parse(
      encryptWithKey(encryptionKey, {
        phone: '+2348000000000',
        otp: '123456',
      }),
    ) as { v: number; iv: string; authTag: string; ciphertext: string };
    envelope.v = 2;

    await expect(
      claimWithPayload(JSON.stringify(envelope)),
    ).resolves.toBeNull();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          lastError: 'Invalid notification payload',
        }) as unknown,
      }),
    );
  });

  it('fails closed when the encryption key is missing at enqueue time', async () => {
    configGet.mockReturnValue(undefined);

    await expect(
      queue.enqueueOtpRequested({
        phone: '+2348000000000',
        otp: '123456',
      }),
    ).rejects.toThrow('Notification payload encryption key is not configured');
    expect(prisma.notificationJob.create).not.toHaveBeenCalled();
  });

  it('still maps redacted payloads without requiring decryption', async () => {
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

    await expect(queue.listRecentJobs(1)).resolves.toEqual([
      expect.objectContaining({
        id: 'job_redacted',
        payload: { phone: '<redacted>', redacted: true },
      }),
    ]);
  });
});
