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
  consentPreference: {
    analyticsEnabled: true,
    productResearchEnabled: false,
    updatedAt: date,
  },
};

describe('AccountService dual consent change', () => {
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
    prisma.consentPreference.findUnique.mockResolvedValue({
      analyticsEnabled: true,
      productResearchEnabled: false,
    });
    prisma.consentPreference.upsert.mockResolvedValue({});
    prisma.consentRecord.createMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('writes grant and revoke audit rows in one request', async () => {
    await service.updateConsents('user_1', {
      analyticsEnabled: false,
      productResearchEnabled: true,
    });

    expect(prisma.consentRecord.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user_1',
          category: ConsentCategory.analytics,
          granted: false,
        },
        {
          userId: 'user_1',
          category: ConsentCategory.product_research,
          granted: true,
        },
      ],
    });
    expect(prisma.consentPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: {
        userId: 'user_1',
        analyticsEnabled: false,
        productResearchEnabled: true,
      },
      update: {
        analyticsEnabled: false,
        productResearchEnabled: true,
      },
    });
  });
});
