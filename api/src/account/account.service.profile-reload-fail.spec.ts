import { NotFoundException } from '@nestjs/common';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService profile reload failure after write', () => {
  const prisma = {
    user: { updateMany: jest.fn(), findUnique: jest.fn() },
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

  it('does not treat a post-write account reload outage as a missing account', async () => {
    const reloadFail = new Error(
      'account reload unavailable after profile write',
    );
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockRejectedValue(reloadFail);

    const error = await service
      .updateProfile('user_1', { displayName: 'Ada' })
      .catch((reason: unknown) => reason);

    expect(error).toBe(reloadFail);
    expect(error).not.toBeInstanceOf(NotFoundException);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { displayName: 'Ada' },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      include: { consentPreference: true },
    });
  });
});
