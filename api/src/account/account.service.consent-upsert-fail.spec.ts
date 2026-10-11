import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const date = new Date('2026-09-08T12:00:00.000Z');
const user = {
  id: 'user_1',
  phone: '+2348012345678',
  displayName: null,
  createdAt: date,
  updatedAt: date,
  consentPreference: null,
};

describe('AccountService consent preference persist failure', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    consentRecord: { createMany: jest.fn() },
    consentPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
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
    prisma.consentPreference.findUnique.mockResolvedValue(null);
    prisma.consentPreference.upsert.mockRejectedValue(
      new Error('consent preference persist unavailable'),
    );
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('does not write consent audit rows when preference persist fails', async () => {
    await expect(
      service.updateConsents('user_1', { productResearchEnabled: true }),
    ).rejects.toThrow('consent preference persist unavailable');

    expect(prisma.consentPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: {
        userId: 'user_1',
        analyticsEnabled: false,
        productResearchEnabled: true,
      },
      update: {
        analyticsEnabled: undefined,
        productResearchEnabled: true,
      },
    });
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { id: true },
    });
  });
});
