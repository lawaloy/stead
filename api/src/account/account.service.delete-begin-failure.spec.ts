import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService deleteAccount when deletion setup fails', () => {
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

  it('releases any delivery block and skips erasure when beginAccountDeletion throws', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: '+2348012345678' });
    notifications.beginAccountDeletion.mockRejectedValue(
      new Error('queue unavailable'),
    );

    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).rejects.toThrow('queue unavailable');
    expect(notifications.beginAccountDeletion).toHaveBeenCalledWith(
      'user_1',
      '+2348012345678',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.finalizeAccountDeletion).not.toHaveBeenCalled();
    expect(notifications.restoreForAccount).toHaveBeenCalledWith('user_1');
  });
});
