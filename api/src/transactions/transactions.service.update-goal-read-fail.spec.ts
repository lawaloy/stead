import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService update destination-goal lookup failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not relink a transaction when the destination goal cannot be read', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockRejectedValue(
      new Error('goal ownership lookup unavailable'),
    );

    await expect(
      service.update('user_1', 'tx_1', { goalId: 'goal_1' }),
    ).rejects.toThrow('goal ownership lookup unavailable');

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
