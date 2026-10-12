import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService data export when the account bundle cannot be loaded', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    notificationJob: { findMany: jest.fn() },
    authEvent: { findMany: jest.fn() },
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

  it('surfaces a profile-bundle query failure instead of a partial export', async () => {
    const failure = new Error('profile load unavailable');
    prisma.user.findUnique.mockRejectedValue(failure);

    await expect(service.exportData('user_1')).rejects.toBe(failure);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      include: {
        consentPreference: true,
        consentRecords: { orderBy: { createdAt: 'asc' } },
        goals: { orderBy: { createdAt: 'asc' } },
        transactions: { orderBy: { occurredAt: 'asc' } },
        alertPreference: true,
      },
    });
    expect(prisma.notificationJob.findMany).not.toHaveBeenCalled();
    expect(prisma.authEvent.findMany).not.toHaveBeenCalled();
  });
});
