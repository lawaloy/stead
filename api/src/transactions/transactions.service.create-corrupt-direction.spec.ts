import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService create corrupt direction', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        create: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('fails closed after persist when the stored direction is not in or out', async () => {
    prisma.transaction.create.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: null,
      amountKobo: 12_500n,
      direction: 'transfer',
      occurredAt: new Date('2026-01-02T03:04:05.000Z'),
      note: 'Groceries',
      createdAt: new Date('2026-01-02T03:05:06.000Z'),
    });

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: '2026-01-02T03:04:05.000Z',
        note: 'Groceries',
      }),
    ).rejects.toThrow('Unsupported transaction direction: transfer');

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: null,
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt: new Date('2026-01-02T03:04:05.000Z'),
        note: 'Groceries',
      },
    });
  });
});
