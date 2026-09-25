import { NotFoundException } from '@nestjs/common';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService consent updates for a missing account', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
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
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('rejects consent updates when the account disappears inside the transaction', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateConsents('user_1', { analyticsEnabled: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.consentPreference.findUnique).not.toHaveBeenCalled();
    expect(prisma.consentPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });
});
