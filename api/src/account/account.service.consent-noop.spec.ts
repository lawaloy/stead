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

describe('AccountService consent no-op updates', () => {
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
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('does not write consent rows when submitted values are unchanged', async () => {
    await expect(
      service.updateConsents('user_1', {
        analyticsEnabled: true,
        productResearchEnabled: false,
      }),
    ).resolves.toEqual({
      profile: {
        id: 'user_1',
        phone: '+2348012345678',
        displayName: null,
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      },
      consents: {
        analyticsEnabled: true,
        productResearchEnabled: false,
        updatedAt: date.toISOString(),
      },
    });
    expect(prisma.consentPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.consentRecord.createMany).not.toHaveBeenCalled();
  });
});
