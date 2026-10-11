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

describe('AccountService data export when auth history read fails', () => {
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
    prisma.notificationJob.findMany.mockResolvedValue([]);
    prisma.authEvent.findMany.mockRejectedValue(
      new Error('auth history read unavailable'),
    );
  });

  it('surfaces an auth-history query failure instead of a partial export', async () => {
    await expect(service.exportData('user_1')).rejects.toThrow(
      'auth history read unavailable',
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
    expect(prisma.authEvent.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user_1' }, { phone: user.phone }] },
      orderBy: { createdAt: 'asc' },
    });
  });
});
