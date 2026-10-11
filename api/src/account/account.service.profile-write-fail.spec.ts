import { NotFoundException } from '@nestjs/common';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService profile persist failure', () => {
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

  it('does not treat a profile write outage as a missing account', async () => {
    const failure = new Error('profile persist unavailable');
    prisma.user.updateMany.mockRejectedValue(failure);

    const error = await service
      .updateProfile('user_1', { displayName: 'Ada' })
      .catch((reason: unknown) => reason);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(NotFoundException);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { displayName: 'Ada' },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
