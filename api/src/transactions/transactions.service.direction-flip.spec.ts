import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService direction flip', () => {
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

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');
  const createdAt = new Date('2026-01-02T03:05:06.000Z');
  const transactionRecord = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 12_500n,
    direction: 'out',
    occurredAt,
    note: 'Groceries',
    createdAt,
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

  it('flips an owned expense to income after the ownership check', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      direction: 'in',
    });

    await expect(
      service.update('user_1', 'tx_1', { direction: 'in' }),
    ).resolves.toEqual({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_1',
      amountKobo: 12_500,
      direction: 'in',
      occurredAt: occurredAt.toISOString(),
      note: 'Groceries',
      createdAt: createdAt.toISOString(),
    });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: 'in',
        amountKobo: undefined,
        occurredAt: undefined,
        goalId: undefined,
        note: undefined,
      },
    });
  });
});
