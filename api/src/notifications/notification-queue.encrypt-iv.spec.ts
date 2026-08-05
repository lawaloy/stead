import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService encrypt IV uniqueness', () => {
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

  it('uses a fresh IV so identical OTP payloads encrypt differently', async () => {
    const envelopes: string[] = [];
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        envelopes.push(input.data.payloadJson);
        return Promise.resolve({ id: `job_${envelopes.length}` });
      },
    );

    const payload = { phone: '+2348000000000', otp: '123456' };
    await queue.enqueueOtpRequested(payload);
    await queue.enqueueOtpRequested(payload);

    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).not.toEqual(envelopes[1]);

    const first = JSON.parse(envelopes[0]) as {
      v: number;
      iv: string;
      authTag: string;
      ciphertext: string;
    };
    const second = JSON.parse(envelopes[1]) as {
      v: number;
      iv: string;
      authTag: string;
      ciphertext: string;
    };

    expect(first.v).toBe(1);
    expect(second.v).toBe(1);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);

    for (const [index, envelope] of envelopes.entries()) {
      prisma.notificationJob.findFirst.mockResolvedValue({
        id: `job_${index + 1}`,
      });
      prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.notificationJob.findUniqueOrThrow.mockResolvedValue({
        id: `job_${index + 1}`,
        type: 'otp.requested',
        payloadJson: envelope,
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

      await expect(queue.claimReadyJob()).resolves.toEqual(
        expect.objectContaining({
          payload: { phone: '+2348000000000', otp: '123456' },
        }),
      );
    }
  });
});
