import { ConsentCategory } from '@prisma/client';
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

describe('AccountService consent audit write failure', () => {
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
    prisma.consentPreference.upsert.mockResolvedValue({});
    prisma.consentRecord.createMany.mockRejectedValue(
      new Error('consent audit write unavailable'),
    );
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('surfaces an audit insert failure instead of returning the updated account', async () => {
    await expect(
      service.updateConsents('user_1', { productResearchEnabled: true }),
    ).rejects.toThrow('consent audit write unavailable');

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
    expect(prisma.consentRecord.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user_1',
          category: ConsentCategory.product_research,
          granted: true,
        },
      ],
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { id: true },
    });
  });
});
