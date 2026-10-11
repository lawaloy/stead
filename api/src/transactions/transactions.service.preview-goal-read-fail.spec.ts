import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService previewImport destination-goal lookup failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
      createMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not preview rows when the destination goal cannot be read', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Transfer,5000,income',
    ].join('\n');
    prisma.goal.findFirst.mockRejectedValue(
      new Error('goal ownership lookup unavailable'),
    );

    await expect(
      service.previewImport('user_1', {
        goalId: 'goal_1',
        csv,
      }),
    ).rejects.toThrow('goal ownership lookup unavailable');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });
});
