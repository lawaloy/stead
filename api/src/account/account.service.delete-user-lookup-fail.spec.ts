import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService deleteAccount identity lookup failure', () => {
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

  it('rejects deletion before starting notification or data-erasure side effects when the account lookup fails', async () => {
    const failure = new Error('account lookup unavailable');
    prisma.user.findUnique.mockRejectedValue(failure);

    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).rejects.toBe(failure);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { phone: true },
    });
    expect(notifications.beginAccountDeletion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.finalizeAccountDeletion).not.toHaveBeenCalled();
    expect(notifications.restoreForAccount).not.toHaveBeenCalled();
  });
});
