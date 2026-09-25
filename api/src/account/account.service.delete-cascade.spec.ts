import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const phone = '+2348012345678';

describe('AccountService deleteAccount owned-row cascade', () => {
  const prisma = {
    user: { findUnique: jest.fn(), deleteMany: jest.fn() },
    notificationJob: { deleteMany: jest.fn() },
    authEvent: { deleteMany: jest.fn() },
    otpCode: { deleteMany: jest.fn() },
    transaction: { deleteMany: jest.fn() },
    alertState: { deleteMany: jest.fn() },
    alertPreference: { deleteMany: jest.fn() },
    consentPreference: { deleteMany: jest.fn() },
    consentRecord: { deleteMany: jest.fn() },
    goal: { deleteMany: jest.fn() },
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
    prisma.user.findUnique.mockResolvedValue({ phone });
    notifications.beginAccountDeletion.mockResolvedValue([]);
    prisma.user.deleteMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('erases every owned table before deleting the user row', async () => {
    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).resolves.toMatchObject({ ok: true });

    const owned = { where: { userId: 'user_1' } };
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.alertState.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.alertPreference.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.consentPreference.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.consentRecord.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.goal.deleteMany).toHaveBeenCalledWith(owned);
    expect(prisma.authEvent.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user_1' }, { phone }] },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
    });
    expect(notifications.finalizeAccountDeletion).toHaveBeenCalledWith(
      'user_1',
    );
    expect(notifications.restoreForAccount).not.toHaveBeenCalled();
  });
});
