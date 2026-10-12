import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService consent no-op reload failure', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    consentRecord: { createMany: jest.fn() },
    consentPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const notifications = {
    beginAccountDeletion: jest.fn(),
    restoreForAccount: jest.fn(),
    finalizeAccountDeletion: jest.fn(),
  };
  let service: AccountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationQueueService,
    );
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1' })
      .mockRejectedValueOnce(new Error('account reload unavailable'));
    prisma.consentPreference.findUnique.mockResolvedValue({
      analyticsEnabled: true,
      productResearchEnabled: false,
    });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('surfaces a post-transaction account reload failure without writing unchanged consents', async () => {
    await expect(
      service.updateConsents('user_1', {
        analyticsEnabled: true,
        productResearchEnabled: false,
      }),
    ).rejects.toThrow('account reload unavailable');

    expect(prisma.consentPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'user_1' },
      select: { id: true },
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'user_1' },
      include: { consentPreference: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
