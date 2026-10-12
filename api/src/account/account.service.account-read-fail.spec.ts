import { NotFoundException } from '@nestjs/common';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService account read failure', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
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
  });

  it('does not treat an account-load outage as a missing account', async () => {
    const failure = new Error('account read unavailable');
    prisma.user.findUnique.mockRejectedValue(failure);

    const error = await service
      .getAccount('user_1')
      .catch((reason: unknown) => reason);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      include: { consentPreference: true },
    });
  });
});
