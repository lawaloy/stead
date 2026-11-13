import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService empty vs whitespace encryption keys', () => {
  const payload = { phone: '+2348000000000', otp: '123456' };
  let prisma: {
    notificationJob: {
      create: jest.Mock;
    };
  };

  const queueFor = (secret: string) =>
    new NotificationQueueService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue(secret),
      } as never,
    );

  beforeEach(() => {
    prisma = {
      notificationJob: {
        create: jest.fn(),
      },
    };
  });

  it('treats an empty encryption key as missing and encrypts OTP payloads with a whitespace-only key', async () => {
    await expect(
      queueFor('').enqueueOtpRequested(
        payload,
        undefined,
        'otp_1',
        'otp.requested:empty-key',
      ),
    ).rejects.toThrow('Notification payload encryption key is not configured');
    expect(prisma.notificationJob.create).not.toHaveBeenCalled();

    let payloadJson = '';
    prisma.notificationJob.create.mockImplementation(
      (input: { data: { payloadJson: string } }) => {
        payloadJson = input.data.payloadJson;
        return Promise.resolve({ id: 'job_1' });
      },
    );

    await expect(
      queueFor(' \t\n ').enqueueOtpRequested(
        payload,
        undefined,
        'otp_2',
        'otp.requested:whitespace-key',
      ),
    ).resolves.toBe('job_1');

    expect(payloadJson).not.toContain(payload.phone);
    expect(payloadJson).not.toContain(payload.otp);

    const envelope = JSON.parse(payloadJson) as {
      v: number;
      iv: string;
      authTag: string;
      ciphertext: string;
    };
    expect(envelope.v).toBe(1);
    expect(envelope.iv.length).toBeGreaterThan(0);
    expect(envelope.authTag.length).toBeGreaterThan(0);
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
  });
});
