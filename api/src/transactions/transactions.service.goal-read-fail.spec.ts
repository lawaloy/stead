import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService goal ownership lookup failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');

  beforeEach(() => {
    prisma = {
      transaction: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not persist a manual create when the destination goal cannot be read', async () => {
    prisma.goal.findFirst.mockRejectedValue(
      new Error('goal ownership lookup unavailable'),
    );

    await expect(
      service.create('user_1', {
        goalId: 'goal_1',
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        note: 'Groceries',
      }),
    ).rejects.toThrow('goal ownership lookup unavailable');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('does not import rows when the destination goal cannot be read', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Transfer,5000,income',
    ].join('\n');
    prisma.goal.findFirst.mockRejectedValue(
      new Error('goal ownership lookup unavailable'),
    );

    await expect(
      service.confirmImport('user_1', {
        goalId: 'goal_1',
        csv,
        rowNumbers: [2],
      }),
    ).rejects.toThrow('goal ownership lookup unavailable');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});
