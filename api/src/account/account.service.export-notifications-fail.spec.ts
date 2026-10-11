import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const date = new Date('2026-09-08T12:00:00.000Z');
const user = {
  id: 'user_1',
  phone: '+2348012345678',
  displayName: 'Ada',
  createdAt: date,
  updatedAt: date,
  consentPreference: null,
  consentRecords: [],
  goals: [],
  transactions: [],
  alertPreference: null,
};

describe('AccountService data export when notification history read fails', () => {
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
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.notificationJob.findMany.mockRejectedValue(
      new Error('notification history read unavailable'),
    );
    prisma.authEvent.findMany.mockResolvedValue([]);
  });

  it('surfaces a notification-history query failure instead of a partial export', async () => {
    await expect(service.exportData('user_1')).rejects.toThrow(
      'notification history read unavailable',
    );

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
    expect(prisma.notificationJob.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        provider: true,
        providerMessageId: true,
        createdAt: true,
        sentAt: true,
        failedAt: true,
      },
    });
  });
});
