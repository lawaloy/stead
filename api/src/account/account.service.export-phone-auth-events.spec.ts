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

describe('AccountService data export of phone-matched auth events', () => {
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
  });

  it('includes pre-account phone-matched events and still redacts device fields', async () => {
    prisma.authEvent.findMany.mockResolvedValue([
      {
        type: 'otp_requested',
        countryIso: 'NG',
        createdAt: date,
        userId: null,
        ip: '192.0.2.1',
        deviceHash: 'secret-device',
      },
      {
        type: 'otp_verify_succeeded',
        countryIso: 'NG',
        createdAt: date,
        userId: 'user_1',
        ip: '192.0.2.99',
        deviceHash: 'linked-device',
      },
    ]);

    const exported = await service.exportData('user_1');

    expect(prisma.authEvent.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user_1' }, { phone: user.phone }] },
      orderBy: { createdAt: 'asc' },
    });
    expect(exported.authHistory).toEqual([
      {
        type: 'otp_requested',
        countryIso: 'NG',
        createdAt: date.toISOString(),
      },
      {
        type: 'otp_verify_succeeded',
        countryIso: 'NG',
        createdAt: date.toISOString(),
      },
    ]);
    expect(exported.authHistory[0]).not.toHaveProperty('userId');
    expect(exported.authHistory[0]).not.toHaveProperty('ip');
    expect(exported.authHistory[0]).not.toHaveProperty('deviceHash');
    expect(JSON.stringify(exported)).not.toContain('192.0.2.1');
    expect(JSON.stringify(exported)).not.toContain('secret-device');
  });
});
