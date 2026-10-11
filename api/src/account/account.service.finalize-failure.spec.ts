import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const user = {
  phone: '+2348012345678',
};

describe('AccountService deleteAccount finalize failure', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
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
    prisma.user.findUnique.mockResolvedValue(user);
    notifications.beginAccountDeletion.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) => {
        prisma.user.deleteMany.mockResolvedValue({ count: 1 });
        return callback(prisma);
      },
    );
  });

  it('restores the delivery gate when finalize throws after a successful cascade', async () => {
    notifications.finalizeAccountDeletion.mockImplementation(() => {
      throw new Error('finalize failed');
    });

    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).rejects.toThrow('finalize failed');
    expect(notifications.finalizeAccountDeletion).toHaveBeenCalledWith(
      'user_1',
    );
    expect(notifications.restoreForAccount).toHaveBeenCalledWith('user_1');
  });
});
