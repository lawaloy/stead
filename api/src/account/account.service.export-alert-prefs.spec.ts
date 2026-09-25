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
  alertPreference: {
    weeklySummaryEnabled: true,
    riskAlertsEnabled: false,
    timeZone: 'Africa/Lagos',
    weeklyDay: 1,
    weeklyHourLocal: 9,
    updatedAt: date,
  },
};

describe('AccountService data export with alert preferences', () => {
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

  it('includes saved alert preferences instead of null', async () => {
    const exported = await service.exportData('user_1');

    expect(exported.alertPreferences).toEqual({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
      updatedAt: date.toISOString(),
    });
  });
});
