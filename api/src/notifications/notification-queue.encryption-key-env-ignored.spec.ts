import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService process.env NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ignore', () => {
  const configKey = 'test-notification-encryption-key-config';
  const envKey = 'test-notification-encryption-key-envxxx';
  const payload = { phone: '+2348000000000', otp: '123456' };
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
  let previous: string | undefined;

  const encryptWithKey = (secret: string, value: unknown) => {
    const key = createHash('sha256').update(secret, 'utf8').digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
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
    previous = process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY;
    process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY = envKey;
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
        get: jest.fn((key: string) =>
          key === 'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY' ? configKey : undefined,
        ),
      } as never,
    );
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY;
    } else {
      process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY = previous;
    }
  });

  it('encrypts and decrypts with ConfigService even when process.env has a different key', async () => {
    let payloadJson = '';
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        payloadJson = input.data.payloadJson;
        return Promise.resolve({ id: 'job_1' });
      },
    );

    await expect(
      queue.enqueueOtpRequested(
        payload,
        undefined,
        'otp_1',
        'otp.requested:key-1',
      ),
    ).resolves.toBe('job_1');

    expect(payloadJson).not.toContain(payload.phone);
    expect(payloadJson).not.toContain(payload.otp);

    await expect(claimWithPayload(payloadJson)).resolves.toEqual(
      expect.objectContaining({
        id: 'job_1',
        type: 'otp.requested',
        payload,
      }),
    );
    expect(prisma.notificationJob.update).not.toHaveBeenCalled();
  });

  it('fails closed for a blob encrypted with process.env when ConfigService has a different key', async () => {
    await expect(
      claimWithPayload(encryptWithKey(envKey, payload)),
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
});
