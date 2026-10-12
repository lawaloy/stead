import { ConsentCategory } from '@prisma/client';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService consent reload failure after commit', () => {
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
    prisma.consentPreference.findUnique.mockResolvedValue(null);
    prisma.consentPreference.upsert.mockResolvedValue({});
    prisma.consentRecord.createMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('surfaces a post-commit account reload failure after consent preference and audit writes succeed', async () => {
    await expect(
      service.updateConsents('user_1', { productResearchEnabled: true }),
    ).rejects.toThrow('account reload unavailable');

    expect(prisma.consentPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: {
        userId: 'user_1',
        analyticsEnabled: false,
        productResearchEnabled: true,
      },
      update: {
        analyticsEnabled: undefined,
        productResearchEnabled: true,
      },
    });
    expect(prisma.consentRecord.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user_1',
          category: ConsentCategory.product_research,
          granted: true,
        },
      ],
    });
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
