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
  goals: [
    {
      id: 'goal_1',
      name: 'Rent',
      amountTotalKobo: 500_000n,
      dueDate: date,
      monthlyIncomeKobo: 0n,
      isActive: true,
      status: 'active',
      endedAt: null,
      createdAt: date,
    },
  ],
  transactions: [],
  alertPreference: null,
};

describe('AccountService data export with zero monthly income', () => {
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
    prisma.authEvent.findMany.mockResolvedValue([]);
  });

  it('exports declared-zero monthly income as 0 instead of coercing it to null', async () => {
    const exported = await service.exportData('user_1');

    expect(exported.goals).toEqual([
      {
        id: 'goal_1',
        name: 'Rent',
        amountTotalKobo: 500_000,
        dueDate: date.toISOString(),
        monthlyIncomeKobo: 0,
        isActive: true,
        status: 'active',
        endedAt: null,
        createdAt: date.toISOString(),
      },
    ]);
  });
});
