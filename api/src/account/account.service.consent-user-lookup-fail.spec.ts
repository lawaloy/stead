import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService consent account lookup failure', () => {
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
    prisma.user.findUnique.mockRejectedValue(
      new Error('consent account lookup unavailable'),
    );
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('does not read or write consents when the account lookup fails', async () => {
    await expect(
      service.updateConsents('user_1', { productResearchEnabled: true }),
    ).rejects.toThrow('consent account lookup unavailable');

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { id: true },
    });
    expect(prisma.consentPreference.findUnique).not.toHaveBeenCalled();
    expect(prisma.consentPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });
});
