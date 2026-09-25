import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService occurredAt update', () => {
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
  const nextOccurredAt = new Date('2026-09-15T12:00:00.000Z');
  const createdAt = new Date('2026-01-02T03:05:06.000Z');
  const transactionRecord = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 12_500n,
    direction: 'out' as const,
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

  it('persists a new occurredAt Date after the ownership check', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      occurredAt: nextOccurredAt,
    });

    await expect(
      service.update('user_1', 'tx_1', {
        occurredAt: nextOccurredAt.toISOString(),
      }),
    ).resolves.toEqual({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_1',
      amountKobo: 12_500,
      direction: 'out',
      occurredAt: nextOccurredAt.toISOString(),
      note: 'Groceries',
      createdAt: createdAt.toISOString(),
    });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: undefined,
        occurredAt: nextOccurredAt,
        goalId: undefined,
        note: undefined,
      },
    });
  });
});
