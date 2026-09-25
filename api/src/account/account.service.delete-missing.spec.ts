import { NotFoundException } from '@nestjs/common';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService deleteAccount for a missing account', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
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
  });

  it('rejects deletion before starting notification or data-erasure side effects', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.deleteAccount('missing', { confirmation: 'DELETE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(notifications.beginAccountDeletion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.finalizeAccountDeletion).not.toHaveBeenCalled();
    expect(notifications.restoreForAccount).not.toHaveBeenCalled();
  });
});
