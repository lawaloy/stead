import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService OTP dedupe identity', () => {
  const encryptionKey = 'test-notification-encryption-key-1234567890';

  const createQueue = (prisma: {
    notificationJob: {
      create?: jest.Mock;
      findUnique: jest.Mock;
    };
  }) =>
    new NotificationQueueService(
      prisma as never as PrismaService,
      {
        get: jest.fn().mockReturnValue(encryptionKey),
      } as never,
    );

  it('rethrows a dedupe collision when the winner is not an OTP job', async () => {
    const collision = { code: 'P2002' };
    const prisma = {
      notificationJob: {
        create: jest.fn().mockRejectedValue(collision),
        findUnique: jest.fn().mockResolvedValue({
          id: 'job_weekly',
          type: 'weekly.summary',
          otpCodeId: 'otp_1',
        }),
      },
    };
    const queue = createQueue(prisma);

    await expect(
      queue.enqueueOtpRequested(
        { phone: '+2348000000000', otp: '123456' },
        'user_1',
        'otp_1',
        'otp.requested:key-hash',
      ),
    ).rejects.toBe(collision);
    expect(prisma.notificationJob.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: 'otp.requested:key-hash' },
      select: { id: true, type: true, otpCodeId: true },
    });
  });

  it('does not treat another OTP id as already enqueued for this request', async () => {
    const prisma = {
      notificationJob: {
        findUnique: jest.fn().mockResolvedValue({
          type: 'otp.requested',
          otpCodeId: 'otp_other',
        }),
      },
    };
    const queue = createQueue(prisma);

    await expect(
      queue.isOtpRequestEnqueued('otp.requested:key-hash', 'otp_1'),
    ).resolves.toBe(false);
  });

  it('does not treat a non-OTP job on the same key as an enqueued OTP', async () => {
    const prisma = {
      notificationJob: {
        findUnique: jest.fn().mockResolvedValue({
          type: 'weekly.summary',
          otpCodeId: 'otp_1',
        }),
      },
    };
    const queue = createQueue(prisma);

    await expect(
      queue.isOtpRequestEnqueued('otp.requested:key-hash', 'otp_1'),
    ).resolves.toBe(false);
  });
});
